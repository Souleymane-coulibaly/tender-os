import { randomUUID } from "node:crypto";
import type { Clock } from "../../../shared-kernel/clock";
import { KnowledgeChunk } from "../domain/knowledge-chunk.entity";
import { KnowledgeDocument } from "../domain/knowledge-document.entity";
import { isKnowledgeDocumentReprocessable, KnowledgeDocumentStatus } from "../domain/knowledge-document-status";
import { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import { KnowledgeEntryStatus } from "../domain/knowledge-entry-status";
import { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";
import { KnowledgeSpace } from "../domain/knowledge-space.aggregate";
import { KnowledgeTag } from "../domain/knowledge-tag.entity";
import { normalizeTagLabel } from "../domain/tag-normalizer";
import type { AuditLogWriter, KnowledgeAuditLogEntry } from "../application/ports/audit-log-writer";
import type { KnowledgeDispatcher, KnowledgeDocumentDispatchInput } from "../application/ports/knowledge-dispatcher";
import type {
  FinalizeKnowledgeDocumentOutcome,
  KnowledgeChunkDraft,
  KnowledgeDocumentRepository,
  ReserveKnowledgeDocumentOutcome,
} from "../application/ports/knowledge-document.repository";
import type { KnowledgeChunkRepository } from "../application/ports/knowledge-chunk.repository";
import type { OutboxEventInput } from "../../outbox";
import type { KnowledgeEntryVersionRepository } from "../application/ports/knowledge-entry-version.repository";
import type { KnowledgeEntryRepository, ListKnowledgeEntriesFilter, ListKnowledgeEntriesResult } from "../application/ports/knowledge-entry.repository";
import type { KnowledgeSearchCriteria, KnowledgeSearchMatch, KnowledgeSearchProvider, KnowledgeSearchResultPage } from "../application/ports/knowledge-search-provider";
import type { KnowledgeSpaceRepository } from "../application/ports/knowledge-space.repository";
import type { KnowledgeTagRepository } from "../application/ports/knowledge-tag.repository";

export const FIXED_NOW = new Date("2026-07-30T10:00:00Z");

export class FixedClock implements Clock {
  constructor(private value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: KnowledgeAuditLogEntry[] = [];
  async record(entry: KnowledgeAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeOutboxWriter {
  readonly events: OutboxEventInput[] = [];
  async write(input: { organizationId: string; events: readonly OutboxEventInput[] }): Promise<void> {
    this.events.push(...input.events);
  }
}

export class RecordingKnowledgeDispatcher implements KnowledgeDispatcher {
  readonly dispatched: KnowledgeDocumentDispatchInput[] = [];
  dispatch(input: KnowledgeDocumentDispatchInput): void {
    this.dispatched.push(input);
  }
}

export class InMemoryKnowledgeSpaceRepository implements KnowledgeSpaceRepository {
  private readonly byId = new Map<string, KnowledgeSpace>();

  async findById(input: { organizationId: string; knowledgeSpaceId: string }): Promise<KnowledgeSpace | null> {
    const space = this.byId.get(input.knowledgeSpaceId);
    return space && space.organizationId === input.organizationId ? space : null;
  }

  async findByOrganizationAndName(input: { organizationId: string; name: string }): Promise<KnowledgeSpace | null> {
    for (const space of this.byId.values()) {
      if (space.organizationId === input.organizationId && space.name === input.name) return space;
    }
    return null;
  }

  async create(space: KnowledgeSpace): Promise<void> {
    const existing = await this.findByOrganizationAndName({ organizationId: space.organizationId, name: space.name });
    if (existing) throw new Error("Simulated unique constraint violation (organizationId, name)");
    this.byId.set(space.id, space);
  }
}

export class InMemoryKnowledgeEntryRepository implements KnowledgeEntryRepository {
  private readonly byId = new Map<string, KnowledgeEntry>();

  constructor(
    private readonly versionRepository: InMemoryKnowledgeEntryVersionRepository = new InMemoryKnowledgeEntryVersionRepository(),
    private readonly tagRepository: InMemoryKnowledgeTagRepository = new InMemoryKnowledgeTagRepository(),
    private readonly auditLogWriter: InMemoryAuditLogWriter = new InMemoryAuditLogWriter(),
  ) {}

  /** Réservé aux tests d'atomicité (correction audit Codex "Anomalie 2") — fait échouer le
   *  PROCHAIN appel à `createWithVersionAndTags` puis se réarme automatiquement, AVANT toute
   *  écriture (entrée, version, ou tag) : reproduit la garantie observable d'une vraie
   *  transaction Prisma annulée (même motif que `InMemoryAnalysisAttemptRepository.failNextCreate`,
   *  correction audit Codex P1-02, Sprint 4.1/4.2). */
  failNextCreateWithVersionAndTags = false;

  /** V2 Sprint 8 — enregistre tous les événements Outbox écrits par ce fake, pour les tests qui
   *  veulent vérifier qu'un événement précis a bien été émis (même motif que `InMemoryAuditLogWriter.entries`). */
  readonly outboxEvents: OutboxEventInput[] = [];

  async findById(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeEntry | null> {
    const entry = this.byId.get(input.knowledgeEntryId);
    return entry && entry.organizationId === input.organizationId ? entry : null;
  }

  async create(entry: KnowledgeEntry): Promise<void> {
    this.byId.set(entry.id, entry);
  }

  async save(entry: KnowledgeEntry): Promise<void> {
    this.byId.set(entry.id, entry);
  }

  async saveWithAudit(input: { entry: KnowledgeEntry; auditEntry: KnowledgeAuditLogEntry; outboxEvents: readonly OutboxEventInput[] }): Promise<void> {
    this.byId.set(input.entry.id, input.entry);
    await this.auditLogWriter.record(input.auditEntry);
    this.outboxEvents.push(...input.outboxEvents);
  }

  async updateWithNewVersion(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    auditEntry: KnowledgeAuditLogEntry;
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<void> {
    this.byId.set(input.entry.id, input.entry);
    await this.versionRepository.create(input.version);
    await this.auditLogWriter.record(input.auditEntry);
    this.outboxEvents.push(...input.outboxEvents);
  }

  async saveValidationWithVersion(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    auditEntry: KnowledgeAuditLogEntry;
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<void> {
    this.byId.set(input.entry.id, input.entry);
    await this.versionRepository.saveValidation(input.version);
    await this.auditLogWriter.record(input.auditEntry);
    this.outboxEvents.push(...input.outboxEvents);
  }

  async createWithVersionAndTags(input: {
    entry: KnowledgeEntry;
    version: KnowledgeEntryVersion;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
    outboxEvents: readonly OutboxEventInput[];
  }): Promise<{ tags: readonly KnowledgeTag[] }> {
    if (this.failNextCreateWithVersionAndTags) {
      this.failNextCreateWithVersionAndTags = false;
      throw new Error("Simulated KnowledgeEntry persistence failure (test-only)");
    }

    const tags: KnowledgeTag[] = [];
    for (const rawLabel of input.tagLabels) {
      const tag = await this.tagRepository.findOrCreate({
        organizationId: input.entry.organizationId,
        label: normalizeTagLabel(rawLabel.label),
        displayLabel: rawLabel.displayLabel,
        occurredAt: input.occurredAt,
      });
      await this.tagRepository.attachToEntry({ organizationId: input.entry.organizationId, knowledgeEntryId: input.entry.id, tagId: tag.id, occurredAt: input.occurredAt });
      tags.push(tag);
    }

    this.byId.set(input.entry.id, input.entry);
    await this.versionRepository.create(input.version);
    // Correction "Corrections Sprint 5" — l'audit fait partie de la même "transaction" simulée :
    // jamais écrit si le point d'échec ci-dessus a déjà levé.
    await this.auditLogWriter.record(input.auditEntry);
    this.outboxEvents.push(...input.outboxEvents);
    return { tags };
  }

  /** Réservé aux tests d'atomicité (correction audit Codex "Anomalie 2") — fait échouer le
   *  PROCHAIN appel à `delete()` puis se réarme automatiquement, AVANT toute suppression :
   *  reproduit la garantie observable de la transaction Prisma réelle (voir
   *  `PrismaKnowledgeEntryRepository.delete`), qui ne supprime rien du tout si le garde-fou
   *  anti-concurrence final échoue. */
  failNextDelete = false;

  async delete(input: { organizationId: string; knowledgeEntryId: string; auditEntry: KnowledgeAuditLogEntry; outboxEvents: readonly OutboxEventInput[] }): Promise<void> {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error("Simulated KnowledgeEntry deletion failure (test-only)");
    }
    this.byId.delete(input.knowledgeEntryId);
    await this.auditLogWriter.record(input.auditEntry);
    this.outboxEvents.push(...input.outboxEvents);
  }

  async countByOrganization(input: { organizationId: string; includeArchived: boolean }): Promise<number> {
    return [...this.byId.values()].filter((entry) => entry.organizationId === input.organizationId && (input.includeArchived || !entry.archivedAt)).length;
  }

  async list(filter: ListKnowledgeEntriesFilter): Promise<ListKnowledgeEntriesResult> {
    let items = [...this.byId.values()].filter((entry) => entry.organizationId === filter.organizationId);
    if (filter.category) items = items.filter((entry) => entry.category === filter.category);
    if (filter.status) items = items.filter((entry) => entry.status === filter.status);
    if (!filter.includeArchived) items = items.filter((entry) => !entry.archivedAt);
    if (filter.titleSearch) items = items.filter((entry) => entry.title.toLowerCase().includes(filter.titleSearch!.toLowerCase()));
    if (filter.createdAfter) items = items.filter((entry) => entry.createdAt >= filter.createdAfter!);
    if (filter.createdBefore) items = items.filter((entry) => entry.createdAt <= filter.createdBefore!);
    if (filter.clientAccountId === "GLOBAL") {
      items = items.filter((entry) => !entry.clientAccountId);
    } else if (filter.clientAccountId) {
      items = items.filter((entry) => entry.clientAccountId === filter.clientAccountId);
    }
    if (filter.restrictToClientAccountIdsOrGlobal) {
      const allowed = new Set(filter.restrictToClientAccountIdsOrGlobal);
      items = items.filter((entry) => !entry.clientAccountId || allowed.has(entry.clientAccountId));
    }

    items = items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = items.length;
    const page = items.slice(0, filter.limit);
    return { items: page, nextCursor: null, total };
  }
}

export class InMemoryKnowledgeEntryVersionRepository implements KnowledgeEntryVersionRepository {
  readonly versions: KnowledgeEntryVersion[] = [];

  async create(version: KnowledgeEntryVersion): Promise<void> {
    this.versions.push(version);
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeEntryVersion[]> {
    return this.versions
      .filter((version) => version.organizationId === input.organizationId && version.knowledgeEntryId === input.knowledgeEntryId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async findByVersionNumber(input: { organizationId: string; knowledgeEntryId: string; versionNumber: number }): Promise<KnowledgeEntryVersion | null> {
    return (
      this.versions.find(
        (version) => version.organizationId === input.organizationId && version.knowledgeEntryId === input.knowledgeEntryId && version.versionNumber === input.versionNumber,
      ) ?? null
    );
  }

  async saveValidation(version: KnowledgeEntryVersion): Promise<void> {
    const index = this.versions.findIndex((v) => v.id === version.id);
    if (index !== -1) this.versions[index] = version;
  }
}

export class InMemoryKnowledgeChunkRepository implements KnowledgeChunkRepository {
  readonly chunks: KnowledgeChunk[] = [];

  async listByDocumentId(input: { organizationId: string; knowledgeDocumentId: string }): Promise<readonly KnowledgeChunk[]> {
    return this.chunks
      .filter((chunk) => chunk.organizationId === input.organizationId && chunk.knowledgeDocumentId === input.knowledgeDocumentId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async findBySequence(input: { organizationId: string; knowledgeDocumentId: string; sequence: number }): Promise<KnowledgeChunk | null> {
    return (
      this.chunks.find(
        (chunk) => chunk.organizationId === input.organizationId && chunk.knowledgeDocumentId === input.knowledgeDocumentId && chunk.sequence === input.sequence,
      ) ?? null
    );
  }
}

/** Reproduit la sémantique de compare-and-set/atomicité de `PrismaKnowledgeDocumentRepository` —
 *  même motif que `InMemoryAnalysisJobRepository` (Sprint 4.1/4.2) : coordonne avec un
 *  `InMemoryKnowledgeChunkRepository` pour que les chunks ne soient jamais écrits si la
 *  finalisation est rejetée. */
export class InMemoryKnowledgeDocumentRepository implements KnowledgeDocumentRepository {
  private readonly byId = new Map<string, KnowledgeDocument>();

  /** Réservé aux tests d'atomicité (correction audit Codex "Anomalie 2") — fait échouer le
   *  PROCHAIN appel à `createForEntry` puis se réarme automatiquement, AVANT toute écriture. */
  failNextCreateForEntry = false;

  constructor(
    private readonly chunkStore: InMemoryKnowledgeChunkRepository = new InMemoryKnowledgeChunkRepository(),
    private readonly entryRepository: InMemoryKnowledgeEntryRepository = new InMemoryKnowledgeEntryRepository(),
    private readonly versionRepository: InMemoryKnowledgeEntryVersionRepository = new InMemoryKnowledgeEntryVersionRepository(),
    private readonly tagRepository: InMemoryKnowledgeTagRepository = new InMemoryKnowledgeTagRepository(),
    private readonly auditLogWriter: InMemoryAuditLogWriter = new InMemoryAuditLogWriter(),
  ) {}

  /** Correction audit Codex "Anomalie 2" — même garantie observable qu'une vraie transaction
   *  Prisma (`PrismaKnowledgeDocumentRepository.createForEntry`) : soit tout est écrit (entrée,
   *  version, document, tags, audit), soit rien ne l'est. */
  async createForEntry(input: {
    isNewEntry: boolean;
    entry: KnowledgeEntry;
    entryVersion: KnowledgeEntryVersion;
    document: KnowledgeDocument;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
  }): Promise<{ tags: readonly KnowledgeTag[] }> {
    if (this.failNextCreateForEntry) {
      this.failNextCreateForEntry = false;
      throw new Error("Simulated KnowledgeDocument persistence failure (test-only)");
    }

    const tags: KnowledgeTag[] = [];
    for (const rawLabel of input.tagLabels) {
      const tag = await this.tagRepository.findOrCreate({
        organizationId: input.entry.organizationId,
        label: normalizeTagLabel(rawLabel.label),
        displayLabel: rawLabel.displayLabel,
        occurredAt: input.occurredAt,
      });
      await this.tagRepository.attachToEntry({ organizationId: input.entry.organizationId, knowledgeEntryId: input.entry.id, tagId: tag.id, occurredAt: input.occurredAt });
      tags.push(tag);
    }

    if (input.isNewEntry) {
      await this.entryRepository.create(input.entry);
    } else {
      await this.entryRepository.save(input.entry);
    }
    await this.versionRepository.create(input.entryVersion);
    await this.create(input.document);
    await this.auditLogWriter.record(input.auditEntry);

    return { tags };
  }

  async findById(input: { organizationId: string; knowledgeDocumentId: string }): Promise<KnowledgeDocument | null> {
    const document = this.byId.get(input.knowledgeDocumentId);
    return document && document.organizationId === input.organizationId ? document : null;
  }

  async findLatestByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeDocument | null> {
    const matching = [...this.byId.values()].filter((document) => document.organizationId === input.organizationId && document.knowledgeEntryId === input.knowledgeEntryId);
    matching.sort((a, b) => b.versionNumber - a.versionNumber);
    return matching[0] ?? null;
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeDocument[]> {
    return [...this.byId.values()].filter((document) => document.organizationId === input.organizationId && document.knowledgeEntryId === input.knowledgeEntryId);
  }

  async create(document: KnowledgeDocument): Promise<void> {
    this.byId.set(document.id, document);
  }

  async reserveForProcessing(input: { organizationId: string; knowledgeDocumentId: string; occurredAt: Date }): Promise<ReserveKnowledgeDocumentOutcome> {
    const document = await this.findById(input);
    if (!document) return { kind: "not_startable", status: "NOT_FOUND" };
    if (!(document.status === KnowledgeDocumentStatus.Pending || isKnowledgeDocumentReprocessable(document.status))) {
      return { kind: "not_startable", status: document.status };
    }
    document.reserve(input.occurredAt);
    await this.create(document);
    return { kind: "reserved", document };
  }

  /** Correction audit Codex "Anomalie 3" — la transition de l'entrée se fait ICI, directement
   *  avec `this.entryRepository` (même fake que celui partagé par les autres tests), jamais via un
   *  callback opaque — même garantie observable que `PrismaKnowledgeDocumentRepository.finalizeAttempt`. */
  async finalizeAttempt(input: {
    organizationId: string;
    knowledgeDocumentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeKnowledgeDocumentOutcome;
    chunks: readonly KnowledgeChunkDraft[];
  }): Promise<{ applied: boolean }> {
    const document = await this.findById(input);
    if (!document || document.attemptCount !== input.expectedAttemptCount || document.status !== KnowledgeDocumentStatus.Processing) {
      return { applied: false };
    }

    const outcome = input.outcome;
    const newChunks =
      outcome.kind === "failed"
        ? []
        : input.chunks.map((chunk, index) =>
            KnowledgeChunk.create({
              id: randomUUID(),
              organizationId: input.organizationId,
              knowledgeEntryId: document.knowledgeEntryId,
              knowledgeDocumentId: input.knowledgeDocumentId,
              sequence: index,
              content: chunk.content,
              pageStart: chunk.pageStart,
              pageEnd: chunk.pageEnd,
              sheetName: chunk.sheetName,
              sectionTitle: chunk.sectionTitle,
              tokenEstimate: chunk.tokenEstimate,
              occurredAt: input.occurredAt,
            }),
          );

    if (outcome.kind === "failed") {
      document.fail({ errorMessage: outcome.errorMessage }, input.occurredAt);
    } else {
      document.complete({ outcome: outcome.kind === "succeeded" ? KnowledgeDocumentStatus.Ready : KnowledgeDocumentStatus.PartiallyReady, language: outcome.language, warnings: outcome.warnings }, input.occurredAt);
    }

    // Remplace tout le jeu de chunks existant pour CE document (mission §7) — jamais une mise à
    // jour partielle, jamais un chunk d'un autre document affecté.
    const remaining = this.chunkStore.chunks.filter((chunk) => chunk.knowledgeDocumentId !== input.knowledgeDocumentId);
    this.chunkStore.chunks.length = 0;
    this.chunkStore.chunks.push(...remaining, ...newChunks);

    await this.create(document);

    const entry = await this.entryRepository.findById({ organizationId: input.organizationId, knowledgeEntryId: document.knowledgeEntryId });
    if (entry && entry.status === KnowledgeEntryStatus.Processing) {
      if (outcome.kind === "failed") {
        entry.completeDocumentProcessing({ outcome: KnowledgeEntryStatus.Failed }, input.occurredAt);
      } else {
        entry.completeDocumentProcessing(
          { outcome: outcome.kind === "succeeded" ? KnowledgeEntryStatus.Ready : KnowledgeEntryStatus.PartiallyReady, language: outcome.language },
          input.occurredAt,
        );
      }
      await this.entryRepository.save(entry);
    }

    return { applied: true };
  }
}

export class InMemoryKnowledgeTagRepository implements KnowledgeTagRepository {
  private readonly byId = new Map<string, KnowledgeTag>();
  private readonly entryTags = new Set<string>(); // `${entryId}:${tagId}`

  async findById(input: { organizationId: string; tagId: string }): Promise<KnowledgeTag | null> {
    const tag = this.byId.get(input.tagId);
    return tag && tag.organizationId === input.organizationId ? tag : null;
  }

  async findByLabel(input: { organizationId: string; label: string }): Promise<KnowledgeTag | null> {
    for (const tag of this.byId.values()) {
      if (tag.organizationId === input.organizationId && tag.label === input.label) return tag;
    }
    return null;
  }

  async findOrCreate(input: { organizationId: string; label: string; displayLabel: string; occurredAt: Date }): Promise<KnowledgeTag> {
    const existing = await this.findByLabel(input);
    if (existing) return existing;
    const tag = KnowledgeTag.create({ id: randomUUID(), organizationId: input.organizationId, label: input.label, displayLabel: input.displayLabel, occurredAt: input.occurredAt });
    this.byId.set(tag.id, tag);
    return tag;
  }

  async listByOrganization(input: { organizationId: string }): Promise<readonly KnowledgeTag[]> {
    return [...this.byId.values()].filter((tag) => tag.organizationId === input.organizationId);
  }

  async listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeTag[]> {
    return [...this.byId.values()].filter((tag) => tag.organizationId === input.organizationId && this.entryTags.has(`${input.knowledgeEntryId}:${tag.id}`));
  }

  async attachToEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string; occurredAt: Date }): Promise<void> {
    this.entryTags.add(`${input.knowledgeEntryId}:${input.tagId}`);
  }

  async detachFromEntry(input: { organizationId: string; knowledgeEntryId: string; tagId: string }): Promise<void> {
    this.entryTags.delete(`${input.knowledgeEntryId}:${input.tagId}`);
  }

  async delete(input: { organizationId: string; tagId: string }): Promise<void> {
    this.byId.delete(input.tagId);
    for (const key of [...this.entryTags]) {
      if (key.endsWith(`:${input.tagId}`)) this.entryTags.delete(key);
    }
  }
}

export class FakeKnowledgeSearchProvider implements KnowledgeSearchProvider {
  constructor(private readonly matches: KnowledgeSearchMatch[] = []) {}

  /** V2 Sprint 8 — capture les derniers critères reçus, pour les tests qui vérifient que
   *  `SearchKnowledgeBaseUseCase` transmet bien un filtre (ex. `validatedOnly`) au provider, jamais
   *  ne le retient/le retraite lui-même (correctif audit Codex P2 — le filtrage réel reste la
   *  responsabilité du provider, ce fake ne fait qu'observer ce qu'il a reçu). */
  lastCriteria?: KnowledgeSearchCriteria;

  async search(criteria: KnowledgeSearchCriteria): Promise<KnowledgeSearchResultPage> {
    this.lastCriteria = criteria;
    return { matches: this.matches, total: this.matches.length };
  }
}
