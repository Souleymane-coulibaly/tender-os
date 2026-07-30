import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { KnowledgeDocument } from "../domain/knowledge-document.entity";
import { KnowledgeDocumentStatus, isKnowledgeDocumentReprocessable } from "../domain/knowledge-document-status";
import type { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import { KnowledgeEntryStatus } from "../domain/knowledge-entry-status";
import type { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";
import type { KnowledgeTag } from "../domain/knowledge-tag.entity";
import { normalizeTagLabel } from "../domain/tag-normalizer";
import type { KnowledgeAuditLogEntry } from "../application/ports/audit-log-writer";
import type {
  FinalizeKnowledgeDocumentOutcome,
  KnowledgeChunkDraft,
  KnowledgeDocumentRepository,
  ReserveKnowledgeDocumentOutcome,
} from "../application/ports/knowledge-document.repository";
import { toDomain as toKnowledgeEntryDomain, toPersistence as toKnowledgeEntryPersistence } from "./knowledge-entry.persistence-mapper";
import { toKnowledgeEntryVersionPersistence } from "./prisma-knowledge-entry-version.repository";
import { attachTagToEntryTx, resolveOrCreateTagTx } from "./knowledge-tag.tx-helpers";
import { writeKnowledgeAuditLogTx } from "./knowledge-audit.tx-helpers";

/** Transactions volontairement COURTES (même motif que `PrismaAnalysisJobRepository`,
 *  `PrismaDocumentExtractionRepository`) — jamais dimensionnées pour tenir un appel d'extraction. */
const SHORT_TX_OPTIONS = { timeout: 10_000, maxWait: 10_000 } as const;

function toKnowledgeDocumentPersistence(document: KnowledgeDocument) {
  return {
    id: document.id,
    organizationId: document.organizationId,
    knowledgeEntryId: document.knowledgeEntryId,
    documentId: document.documentId,
    versionNumber: document.versionNumber,
    status: document.status,
    warnings: [...document.warnings],
    attemptCount: document.attemptCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function toDomain(record: {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  documentId: string;
  versionNumber: number;
  status: string;
  language: string | null;
  warnings: string[];
  errorMessage: string | null;
  attemptCount: number;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeDocument {
  return KnowledgeDocument.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    knowledgeEntryId: record.knowledgeEntryId,
    documentId: record.documentId,
    versionNumber: record.versionNumber,
    status: record.status as KnowledgeDocumentStatus,
    language: record.language ?? undefined,
    warnings: record.warnings,
    errorMessage: record.errorMessage ?? undefined,
    attemptCount: record.attemptCount,
    processedAt: record.processedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

@Injectable()
export class PrismaKnowledgeDocumentRepository implements KnowledgeDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(input: { organizationId: string; knowledgeDocumentId: string }): Promise<KnowledgeDocument | null> {
    const record = await this.prisma.knowledgeDocument.findFirst({ where: { id: input.knowledgeDocumentId, organizationId: input.organizationId } });
    return record ? toDomain(record) : null;
  }

  async findLatestByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeDocument | null> {
    const record = await this.prisma.knowledgeDocument.findFirst({
      where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId },
      orderBy: { versionNumber: "desc" },
    });
    return record ? toDomain(record) : null;
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeDocument[]> {
    const records = await this.prisma.knowledgeDocument.findMany({
      where: { organizationId: input.organizationId, knowledgeEntryId: input.knowledgeEntryId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toDomain);
  }

  async create(document: KnowledgeDocument): Promise<void> {
    await this.prisma.knowledgeDocument.create({ data: toKnowledgeDocumentPersistence(document) });
  }

  async reserveForProcessing(input: { organizationId: string; knowledgeDocumentId: string; occurredAt: Date }): Promise<ReserveKnowledgeDocumentOutcome> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.knowledgeDocumentId}))`;

      const record = await tx.knowledgeDocument.findFirst({ where: { id: input.knowledgeDocumentId, organizationId: input.organizationId } });
      if (!record) {
        return { kind: "not_startable", status: "NOT_FOUND" };
      }

      const document = toDomain(record);
      if (!(document.status === KnowledgeDocumentStatus.Pending || isKnowledgeDocumentReprocessable(document.status))) {
        return { kind: "not_startable", status: document.status };
      }

      document.reserve(input.occurredAt);
      await tx.knowledgeDocument.update({
        where: { id: document.id },
        data: { status: document.status, attemptCount: document.attemptCount, updatedAt: document.updatedAt },
      });

      return { kind: "reserved", document };
    }, SHORT_TX_OPTIONS);
  }

  /**
   * Correction audit Codex "Anomalie 2" (`AddKnowledgeDocumentUseCase`) — voir le port pour le
   * contrat complet. Le stockage physique du fichier a déjà eu lieu AVANT cet appel ; cette
   * transaction ne fait QUE des écritures base de données, jamais d'appel externe.
   */
  async createForEntry(input: {
    isNewEntry: boolean;
    entry: KnowledgeEntry;
    entryVersion: KnowledgeEntryVersion;
    document: KnowledgeDocument;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
  }): Promise<{ tags: readonly KnowledgeTag[] }> {
    return this.prisma.$transaction(async (tx) => {
      if (input.isNewEntry) {
        await tx.knowledgeEntry.create({ data: toKnowledgeEntryPersistence(input.entry) });
      } else {
        const data = toKnowledgeEntryPersistence(input.entry);
        await tx.knowledgeEntry.update({ where: { id: data.id }, data });
      }
      await tx.knowledgeEntryVersion.create({ data: toKnowledgeEntryVersionPersistence(input.entryVersion) });
      await tx.knowledgeDocument.create({ data: toKnowledgeDocumentPersistence(input.document) });

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
      // jamais un document/une entrée ajoutés sans trace d'audit correspondante.
      await writeKnowledgeAuditLogTx(tx, input.auditEntry);

      return { tags };
    }, SHORT_TX_OPTIONS);
  }

  async finalizeAttempt(input: {
    organizationId: string;
    knowledgeDocumentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeKnowledgeDocumentOutcome;
    chunks: readonly KnowledgeChunkDraft[];
  }): Promise<{ applied: boolean }> {
    const outcome = input.outcome;

    return this.prisma.$transaction(async (tx) => {
      const data =
        outcome.kind === "failed"
          ? { status: KnowledgeDocumentStatus.Failed, errorMessage: outcome.errorMessage, processedAt: input.occurredAt, updatedAt: input.occurredAt }
          : {
              status: outcome.kind === "succeeded" ? KnowledgeDocumentStatus.Ready : KnowledgeDocumentStatus.PartiallyReady,
              language: outcome.language ?? null,
              warnings: [...outcome.warnings],
              errorMessage: null,
              processedAt: input.occurredAt,
              updatedAt: input.occurredAt,
            };

      // Compare-and-set (même motif que AnalysisJobRepository/DocumentExtractionRepository) — une
      // finalisation obsolète n'écrit rien, ni le statut, ni les chunks, ni l'entrée.
      const result = await tx.knowledgeDocument.updateMany({
        where: { id: input.knowledgeDocumentId, organizationId: input.organizationId, attemptCount: input.expectedAttemptCount, status: KnowledgeDocumentStatus.Processing },
        data,
      });
      if (result.count === 0) {
        return { applied: false };
      }

      // Récupéré UNE SEULE fois — sert à la fois aux chunks (knowledgeEntryId dénormalisé) et à
      // la transition de l'entrée ci-dessous (correction "Anomalie 3" : plus d'aller-retour DB
      // séparé, hors transaction, pour cette même information).
      const documentRecord = await tx.knowledgeDocument.findFirstOrThrow({ where: { id: input.knowledgeDocumentId } });

      // Un document ne peut jamais devenir READY/PARTIALLY_READY sans que ses chunks soient
      // également écrits (mission §7) — remplace tout jeu existant (une resegmentation
      // remplace, jamais une mise à jour partielle), DANS LA MÊME transaction.
      await tx.knowledgeChunk.deleteMany({ where: { organizationId: input.organizationId, knowledgeDocumentId: input.knowledgeDocumentId } });
      if (input.chunks.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: input.chunks.map((chunk) => ({
            id: randomUUID(),
            organizationId: input.organizationId,
            knowledgeEntryId: documentRecord.knowledgeEntryId,
            knowledgeDocumentId: input.knowledgeDocumentId,
            sequence: chunk.sequence,
            content: chunk.content,
            characterCount: chunk.characterCount,
            pageStart: chunk.pageStart ?? null,
            pageEnd: chunk.pageEnd ?? null,
            sheetName: chunk.sheetName ?? null,
            sectionTitle: chunk.sectionTitle ?? null,
            checksum: chunk.checksum,
            tokenEstimate: chunk.tokenEstimate ?? null,
            createdAt: input.occurredAt,
          })),
        });
      }

      // Correction audit Codex "Anomalie 3" — la transition de `KnowledgeEntry.status` se fait
      // ICI, avec CE `tx`, jamais via un callback qui utiliserait (par erreur) le repository
      // injecté (donc une connexion séparée, hors transaction). Best-effort si l'entrée n'existe
      // plus, ou si elle n'est pas (ou plus) PROCESSING — un document peut être rattaché à une
      // entrée MANUAL déjà READY (jamais passée par PROCESSING), ou l'entrée peut avoir été
      // archivée entre-temps : dans ces cas, seul le document lui-même transite, jamais l'entrée
      // (jamais bloquant pour la finalisation du document, jamais une transition de statut
      // invalide levée depuis le domaine).
      const entryRecord = await tx.knowledgeEntry.findFirst({ where: { id: documentRecord.knowledgeEntryId, organizationId: input.organizationId } });
      if (entryRecord && entryRecord.status === KnowledgeEntryStatus.Processing) {
        const entry = toKnowledgeEntryDomain(entryRecord);
        if (outcome.kind === "failed") {
          entry.completeDocumentProcessing({ outcome: KnowledgeEntryStatus.Failed }, input.occurredAt);
        } else {
          entry.completeDocumentProcessing(
            { outcome: outcome.kind === "succeeded" ? KnowledgeEntryStatus.Ready : KnowledgeEntryStatus.PartiallyReady, language: outcome.language },
            input.occurredAt,
          );
        }
        await tx.knowledgeEntry.update({ where: { id: entry.id }, data: toKnowledgeEntryPersistence(entry) });
      }

      return { applied: true };
    }, SHORT_TX_OPTIONS);
  }
}
