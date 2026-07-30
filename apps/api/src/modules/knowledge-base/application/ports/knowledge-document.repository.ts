import type { Prisma } from "@prisma/client";
import type { KnowledgeDocument } from "../../domain/knowledge-document.entity";
import type { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import type { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import type { KnowledgeTag } from "../../domain/knowledge-tag.entity";
import type { KnowledgeAuditLogEntry } from "./audit-log-writer";

/** Client de transaction Prisma — utilisé pour persister le résultat du traitement (statut +
 *  chunks) DANS LA MÊME transaction que la finalisation. */
export type PrismaTx = Prisma.TransactionClient;

export type KnowledgeChunkDraft = Readonly<{
  sequence: number;
  content: string;
  characterCount: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  checksum: string;
  tokenEstimate?: number | undefined;
}>;

export type ReserveKnowledgeDocumentOutcome =
  | { kind: "reserved"; document: KnowledgeDocument }
  | { kind: "not_startable"; status: string };

export type FinalizeKnowledgeDocumentOutcome =
  | { kind: "succeeded" | "partially_succeeded"; language?: string | undefined; warnings: readonly string[] }
  | { kind: "failed"; errorMessage: string };

export interface KnowledgeDocumentRepository {
  findById(input: { organizationId: string; knowledgeDocumentId: string }): Promise<KnowledgeDocument | null>;
  findLatestByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<KnowledgeDocument | null>;
  listByEntryId(input: { organizationId: string; knowledgeEntryId: string }): Promise<readonly KnowledgeDocument[]>;
  create(document: KnowledgeDocument): Promise<void>;

  /** Réservation atomique COURTE (même motif que `DocumentExtractionRepository`/
   *  `AnalysisJobRepository`) — PENDING/terminal → PROCESSING, incrémente `attemptCount`. */
  reserveForProcessing(input: { organizationId: string; knowledgeDocumentId: string; occurredAt: Date }): Promise<ReserveKnowledgeDocumentOutcome>;

  /**
   * Correction audit Codex "Anomalie 2" (`AddKnowledgeDocumentUseCase`) — écrit, DANS LA MÊME
   * transaction Prisma COURTE : (nouvelle entrée) l'entrée ET sa version 1, OU (entrée existante)
   * la mise à jour de l'entrée (statut + version active) ET sa nouvelle version ; PUIS, toujours,
   * le `KnowledgeDocument` et la résolution/association de ses tags. Le stockage physique du
   * fichier (module Documents) a déjà eu lieu AVANT cet appel — jamais dans cette transaction,
   * jamais d'appel externe pendant qu'une transaction est ouverte. Si cet appel échoue, l'appelant
   * est responsable de la compensation (purge du `Document` physique déjà créé, voir
   * `InternalDocumentCleanupService`). L'entrée d'audit est écrite DANS CETTE MÊME transaction
   * (correction "Corrections Sprint 5" §"atomicité audit/mutation") — jamais un document/une
   * entrée ajoutés sans trace d'audit correspondante.
   */
  createForEntry(input: {
    isNewEntry: boolean;
    entry: KnowledgeEntry;
    entryVersion: KnowledgeEntryVersion;
    document: KnowledgeDocument;
    tagLabels: readonly { label: string; displayLabel: string }[];
    occurredAt: Date;
    auditEntry: KnowledgeAuditLogEntry;
  }): Promise<{ tags: readonly KnowledgeTag[] }>;

  /**
   * Finalisation atomique COURTE, compare-and-set sur `expectedAttemptCount` — persiste le
   * statut du document, son jeu de chunks (remplace tout jeu existant) ET fait transiter
   * `KnowledgeEntry.status` en cohérence, TOUS DANS LA MÊME transaction : un document ne peut
   * jamais devenir READY/PARTIALLY_READY sans que ses chunks soient également écrits, et l'entrée
   * ne peut jamais rester bloquée en PROCESSING alors que son document est déjà dans un état
   * terminal.
   *
   * Correction audit Codex "Anomalie 3" (stabilisation du test HTTP `full document import
   * pipeline`) — l'ancien mécanisme `onSuccessTx` déléguait cette transition à l'appelant via un
   * callback, mais `ProcessKnowledgeDocumentUseCase` l'invoquait en pratique via le
   * `KnowledgeEntryRepository` INJECTÉ (donc via `this.prisma`, PAS le `tx` de cette transaction) :
   * la transition de l'entrée n'était ni réellement transactionnelle avec la finalisation, ni
   * gratuite (un aller-retour DB supplémentaire, séquentiel, hors transaction, contribuant à la
   * latence — et donc à l'instabilité observée — du chemin critique de traitement). Cette
   * transition est désormais effectuée ICI, directement avec `tx`, jamais via un callback opaque.
   */
  finalizeAttempt(input: {
    organizationId: string;
    knowledgeDocumentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeKnowledgeDocumentOutcome;
    chunks: readonly KnowledgeChunkDraft[];
  }): Promise<{ applied: boolean }>;
}

export const KNOWLEDGE_DOCUMENT_REPOSITORY = Symbol("KNOWLEDGE_DOCUMENT_REPOSITORY");
