import type { DocumentExtractionStatus } from "../../domain/document-extraction-status";
import type { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import type { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import type { ExtractionChunk } from "../../domain/extraction-chunk.entity";

/**
 * Vue de lecture/écriture scopée à une transaction Postgres courte protégée par un verrou
 * consultatif (mission Sprint 3 §15, même mécanisme que `MembershipRepository.
 * runExclusiveForOrganization`/`DceDocumentRepository.runExclusiveForDce`) — réservée aux
 * opérations DB rapides (création idempotente, retry). Ne doit JAMAIS entourer une opération d'E/S
 * longue (lecture de fichier, parsing, OCR, rasterisation) — voir `reserveForProcessing`/
 * `finalizeAttempt` pour le traitement lui-même (correction P1-02).
 */
export type ExclusiveExtractionContext = {
  findByDocumentId(input: { organizationId: string; documentId: string }): Promise<DocumentExtraction | null>;
  save(extraction: DocumentExtraction): Promise<void>;
};

export type ReservationOutcome =
  | { kind: "reserved"; extraction: DocumentExtraction }
  | { kind: "not_startable"; status: DocumentExtractionStatus };

/** Résultat de la Phase 2 (hors transaction), consommé par `finalizeAttempt` (Phase 3) — porte
 *  tout ce qu'il faut pour finaliser en une seule écriture atomique courte, jamais une écriture
 *  du statut suivie d'une écriture séparée des chunks (correction P1-02). */
export type FinalizeAttemptOutcome =
  | {
      kind: "succeeded" | "partially_succeeded";
      strategy: DocumentExtractionStrategy;
      /** Nom du moteur ayant traité cette tentative (ex. "pdf-parse", "tesseract.js") — jamais
       *  une clé/secret fournisseur (mission §9 "sécurité"). */
      provider?: string | undefined;
      pageCount?: number | undefined;
      characterCount: number;
      chunkCount: number;
      language?: string | undefined;
      warnings: string[];
      contentChecksum?: string | undefined;
      /** Correctif audit Codex round 2 P1 (Chat IA conversationnel) — version EXACTE de `Document`
       *  réellement lue pour produire `chunks` ci-dessous, voir `DocumentExtractionProps.documentVersionId`. */
      documentVersionId?: string | undefined;
      chunks: readonly ExtractionChunk[];
    }
  | { kind: "not_processable" }
  | { kind: "failed"; strategy?: DocumentExtractionStrategy | undefined; reason: string };

export interface DocumentExtractionRepository {
  findByDocumentId(input: { organizationId: string; documentId: string }): Promise<DocumentExtraction | null>;
  create(extraction: DocumentExtraction): Promise<void>;
  save(extraction: DocumentExtraction): Promise<void>;

  /**
   * Phase 1 (correction P1-02) — réservation atomique COURTE : verrou consultatif scopé au
   * document, vérification du statut, passage à PROCESSING, incrément de `attemptCount`, puis fin
   * immédiate de la transaction. Ne contient JAMAIS de lecture de fichier, de parsing ou d'appel
   * OCR. Empêche un double démarrage : si le statut n'est plus PENDING/READY au moment de
   * l'acquisition du verrou (déjà PROCESSING ailleurs, ou déjà terminal), retourne
   * `not_startable` sans rien modifier — jamais une exception, un no-op explicite.
   */
  reserveForProcessing(input: {
    organizationId: string;
    documentId: string;
    occurredAt: Date;
  }): Promise<ReservationOutcome>;

  /**
   * Phase 3 (correction P1-02) — finalisation atomique COURTE, avec vérification par
   * compare-and-set que `expectedAttemptCount` correspond toujours à l'attempt courant ET que le
   * statut est toujours PROCESSING (`applied: false` sinon, sans aucune écriture — mission "une
   * tentative ancienne ne peut pas écraser une tentative récente"). Remplace atomiquement les
   * chunks avec le nouveau statut dans la même transaction (mission "rollback en cas d'échec de
   * persistance").
   */
  finalizeAttempt(input: {
    organizationId: string;
    documentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
  }): Promise<{ applied: boolean }>;

  /**
   * Verrou court réutilisable (mission §15) pour les opérations qui ne sont PAS le traitement
   * lui-même : création idempotente (Start) et retour FAILED→READY (Retry). Jamais utilisé pour
   * tenir tout un cycle d'extraction (voir `reserveForProcessing`/`finalizeAttempt`).
   */
  runExclusiveShort<T>(input: {
    documentId: string;
    fn: (context: ExclusiveExtractionContext) => Promise<T>;
  }): Promise<T>;
}

export const DOCUMENT_EXTRACTION_REPOSITORY = Symbol("DOCUMENT_EXTRACTION_REPOSITORY");
