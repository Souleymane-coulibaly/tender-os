import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import type { KnowledgeAuditLogEntry } from "../application/ports/audit-log-writer";
import type { KnowledgeEntryRepository, ListKnowledgeEntriesFilter, ListKnowledgeEntriesResult } from "../application/ports/knowledge-entry.repository";
import { KnowledgeEntryNotArchivedError } from "../domain/errors";
import type { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import { KnowledgeEntryStatus } from "../domain/knowledge-entry-status";
import type { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";
import type { KnowledgeTag } from "../domain/knowledge-tag.entity";
import { normalizeTagLabel } from "../domain/tag-normalizer";
import { toDomain, toPersistence } from "./knowledge-entry.persistence-mapper";
import { toKnowledgeEntryVersionPersistence } from "./prisma-knowledge-entry-version.repository";
import { attachTagToEntryTx, resolveOrCreateTagTx } from "./knowledge-tag.tx-helpers";
import { writeKnowledgeAuditLogTx } from "./knowledge-audit.tx-helpers";

/** Transaction volontairement COURTE (même motif que `PrismaKnowledgeDocumentRepository`) —
 *  jamais dimensionnée pour tenir un appel externe (aucun ici : entrée manuelle uniquement). */
const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;

@Injectable()
export class PrismaKnowledgeEntryRepository implements KnowledgeEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeEntry | null> {
    const record = await this.prisma.knowledgeEntry.findFirst({ where: { id: input.knowledgeEntryId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async create(entry: KnowledgeEntry): Promise<void> {
    await this.prisma.knowledgeEntry.create({ data: toPersistence(entry) });
  }

  async save(entry: KnowledgeEntry): Promise<void> {
    const data = toPersistence(entry);
    await this.prisma.knowledgeEntry.update({ where: { id: data.id }, data });
  }

  /**
   * Correction audit Codex "Anomalie 2" — l'entrée, sa version 1 et ses tags (résolution +
   * association) sont écrits DANS LA MÊME transaction Prisma : si la résolution/association d'un
   * tag échoue en cours de route, la transaction entière est annulée par Postgres — aucune entrée,
   * aucune version, aucun lien de tag, aucun tag créé inutilement ne survit.
   */
  async createWithVersionAndTags(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
  }): Promise<{ tags: readonly KnowledgeTag[] }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.knowledgeEntry.create({ data: toPersistence(input.entry) });
      await tx.knowledgeEntryVersion.create({ data: toKnowledgeEntryVersionPersistence(input.version) });

      const tags: KnowledgeTag[] = [];
      for (const rawLabel of input.tagLabels) {
        const tag = await resolveOrCreateTagTx(tx, {
          organizationId: input.entry.organizationId,
          label: normalizeTagLabel(rawLabel.label),
          displayLabel: rawLabel.displayLabel,
          occurredAt: input.occurredAt,
        });
        await attachTagToEntryTx(tx, { organizationId: input.entry.organizationId, knowledgeEntryId: input.entry.id, tagId: tag.id, occurredAt: input.occurredAt });
        tags.push(tag);
      }

      // Correction "Corrections Sprint 5" — l'audit est écrit ICI, DANS LA MÊME transaction :
      // jamais une entrée créée sans sa trace d'audit, jamais une trace d'audit sans l'entrée.
      await writeKnowledgeAuditLogTx(tx, input.auditEntry);

      return { tags };
    }, SHORT_TX_OPTIONS);
  }

  /**
   * Correction audit Codex "Anomalie 2" — suppression EXPLICITE, ordonnée, DANS UNE SEULE
   * transaction courte : chunks → documents → liens de tags → versions → entrée. Les contraintes
   * `onDelete: Cascade` du schéma (migration) rendraient déjà un simple `knowledgeEntry.delete()`
   * atomique via Postgres, mais cette version explicite documente l'intention, reste correcte même
   * si une cascade venait à être retirée par erreur d'une future migration, et ajoute un
   * garde-fou anti-concurrence : la suppression finale de l'entrée revérifie `status = ARCHIVED`
   * DANS la transaction (jamais seulement au moment du contrôle applicatif, avant l'ouverture de
   * la transaction) — si l'entrée a été restaurée entre-temps (concurrence), rien de ce qui
   * précède (chunks/documents/tags/versions déjà supprimés dans CETTE transaction) ne doit
   * survivre : toute la transaction est annulée par Postgres.
   */
  async delete(input: { organizationId: string; knowledgeEntryId: string; auditEntry: KnowledgeAuditLogEntry }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId } });
      await tx.knowledgeDocument.deleteMany({ where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId } });
      await tx.knowledgeEntryTag.deleteMany({ where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId } });
      await tx.knowledgeEntryVersion.deleteMany({ where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId } });

      const result = await tx.knowledgeEntry.deleteMany({
        where: { id: input.knowledgeEntryId, organizationId: input.organizationId, status: KnowledgeEntryStatus.Archived },
      });
      if (result.count === 0) {
        throw new KnowledgeEntryNotArchivedError();
      }

      // Correction "Corrections Sprint 5" — l'audit de suppression est écrit ICI, DANS LA MÊME
      // transaction que les suppressions ci-dessus : jamais une suppression sans trace d'audit,
      // jamais une trace d'audit "supprimé" pour une entrée qui, finalement, ne l'a pas été (ex.
      // garde-fou anti-concurrence déclenché).
      await writeKnowledgeAuditLogTx(tx, input.auditEntry);
    }, SHORT_TX_OPTIONS);
  }

  async countByOrganization(input: { organizationId: string; includeArchived: boolean }): Promise<number> {
    return this.prisma.knowledgeEntry.count({
      where: { organizationId: input.organizationId, ...(input.includeArchived ? {} : { archivedAt: null }) },
    });
  }

  async list(filter: ListKnowledgeEntriesFilter): Promise<ListKnowledgeEntriesResult> {
    const sortDirection = filter.sortDirection ?? "desc";
    const orderBy: Prisma.KnowledgeEntryOrderByWithRelationInput[] = [{ [filter.sort ?? "createdAt"]: sortDirection }, { id: sortDirection }];

    const andConditions: Prisma.KnowledgeEntryWhereInput[] = [];
    if (filter.category) andConditions.push({ category: filter.category });
    if (filter.status) andConditions.push({ status: filter.status });
    if (filter.tagId) andConditions.push({ entryTags: { some: { tagId: filter.tagId, organizationId: filter.organizationId } } });
    if (filter.knowledgeSpaceId) andConditions.push({ knowledgeSpaceId: filter.knowledgeSpaceId });
    if (filter.createdAfter) andConditions.push({ createdAt: { gte: filter.createdAfter } });
    if (filter.createdBefore) andConditions.push({ createdAt: { lte: filter.createdBefore } });
    if (filter.titleSearch) andConditions.push({ title: { contains: filter.titleSearch, mode: "insensitive" } });
    if (!filter.includeArchived) andConditions.push({ archivedAt: null });
    if (filter.clientAccountId === "GLOBAL") {
      andConditions.push({ clientAccountId: null });
    } else if (filter.clientAccountId) {
      andConditions.push({ clientAccountId: filter.clientAccountId });
    }
    if (filter.restrictToClientAccountIdsOrGlobal) {
      andConditions.push({ OR: [{ clientAccountId: null }, { clientAccountId: { in: [...filter.restrictToClientAccountIdsOrGlobal] } }] });
    }

    const where: Prisma.KnowledgeEntryWhereInput = {
      organizationId: filter.organizationId,
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.knowledgeEntry.findMany({
        where,
        orderBy,
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
      this.prisma.knowledgeEntry.count({ where }),
    ]);

    const hasNextPage = records.length > filter.limit;
    const page = hasNextPage ? records.slice(0, filter.limit) : records;

    return {
      items: page.map(toDomain),
      nextCursor: hasNextPage ? (page[page.length - 1]?.id ?? null) : null,
      total,
    };
  }
}
