import {
  ALLOWED_DOCUMENT_EXTRACTION_TRANSITIONS,
  DocumentExtractionStatus,
} from "./document-extraction-status";
import type { DocumentExtractionStrategy } from "./document-extraction-strategy";
import { InvalidExtractionStatusTransitionError } from "./extraction-errors";

export type DocumentExtractionProps = {
  /** Partage sa clé avec `Document`/`DceDocument.documentId` (relation 1:1, mission §5) — jamais
   *  un id de substitution séparé pour une relation qui n'existera jamais autrement que 1:1. */
  documentId: string;
  dceId: string;
  organizationId: string;
  status: DocumentExtractionStatus;
  strategy?: DocumentExtractionStrategy | undefined;
  attemptCount: number;
  pageCount?: number | undefined;
  characterCount?: number | undefined;
  chunkCount?: number | undefined;
  language?: string | undefined;
  warnings: string[];
  lastError?: string | undefined;
  contentChecksum?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentExtractionCompletionInput = {
  outcome: typeof DocumentExtractionStatus.Succeeded | typeof DocumentExtractionStatus.PartiallySucceeded;
  strategy: DocumentExtractionStrategy;
  pageCount?: number | undefined;
  characterCount?: number | undefined;
  chunkCount?: number | undefined;
  language?: string | undefined;
  warnings?: string[] | undefined;
  contentChecksum?: string | undefined;
};

/**
 * Suivi fin d'une extraction documentaire (mission Sprint 3 §5, révisé correction P1-02) — jamais
 * l'analyse IA métier (hors périmètre, voir bible §"Extraction documentaire ≠ Analyse métier IA").
 * Ne contient que ce qui décrit LE TRAITEMENT (statut, stratégie, métriques, erreurs) ; le texte et
 * les chunks eux-mêmes vivent dans `ExtractionChunk`, jamais dupliqués ici.
 *
 * Cycle de vie en 3 phases (correction P1-02, jamais une transaction Prisma longue) :
 * 1. `reserve()` — réservation atomique courte : PENDING|READY → PROCESSING, incrémente
 *    `attemptCount`. C'est la SEULE écriture qui accompagne une lecture-décision-écriture sous
 *    verrou consultatif ; elle ne dépend d'aucune opération d'E/S (lecture de fichier, parsing,
 *    OCR).
 * 2. Le traitement réel (inspection, détection de stratégie, extraction, normalisation,
 *    segmentation) se déroule ENTIÈREMENT hors de toute transaction, porté par l'orchestrateur
 *    applicatif — jamais par cet agrégat.
 * 3. `complete()` / `fail()` / `markNotProcessable()` — finalisation, appelée par l'orchestrateur
 *    UNIQUEMENT si la réservation courante est encore valide (compare-and-set sur `attemptCount`,
 *    voir `DocumentExtractionRepository.finalizeAttempt`) : ces méthodes ne modifient que l'état en
 *    mémoire, jamais la base directement.
 */
export class DocumentExtraction {
  private constructor(private props: DocumentExtractionProps) {}

  static create(input: {
    documentId: string;
    dceId: string;
    organizationId: string;
    occurredAt: Date;
  }): DocumentExtraction {
    return new DocumentExtraction({
      documentId: input.documentId,
      dceId: input.dceId,
      organizationId: input.organizationId,
      status: DocumentExtractionStatus.Pending,
      attemptCount: 0,
      warnings: [],
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentExtractionProps): DocumentExtraction {
    return new DocumentExtraction(props);
  }

  private transitionTo(next: DocumentExtractionStatus, occurredAt: Date): void {
    const allowed = ALLOWED_DOCUMENT_EXTRACTION_TRANSITIONS[this.props.status];
    if (!allowed.includes(next)) {
      throw new InvalidExtractionStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  /** Phase 1 (correction P1-02) — réservation atomique courte : PENDING|READY → PROCESSING,
   *  incrémente `attemptCount` en une seule opération (jamais deux écritures séparées pour la
   *  même intention). `attemptCount` après cet appel devient le jeton de réservation comparé lors
   *  de la finalisation (mission "une tentative ancienne ne peut pas écraser une tentative
   *  récente"). */
  reserve(occurredAt: Date): void {
    this.transitionTo(DocumentExtractionStatus.Processing, occurredAt);
    this.props.attemptCount += 1;
  }

  /** Phase 3 (correction P1-02) — la stratégie n'est connue qu'après l'inspection hors
   *  transaction : elle n'est donc écrite qu'ici, jamais avant. */
  complete(input: DocumentExtractionCompletionInput, occurredAt: Date): void {
    this.transitionTo(input.outcome, occurredAt);
    this.props.strategy = input.strategy;
    this.props.pageCount = input.pageCount;
    this.props.characterCount = input.characterCount;
    this.props.chunkCount = input.chunkCount;
    this.props.language = input.language;
    this.props.warnings = input.warnings ?? [];
    this.props.contentChecksum = input.contentChecksum;
    this.props.lastError = undefined;
  }

  fail(input: { reason: string; strategy?: DocumentExtractionStrategy | undefined }, occurredAt: Date): void {
    this.transitionTo(DocumentExtractionStatus.Failed, occurredAt);
    if (input.strategy) {
      this.props.strategy = input.strategy;
    }
    this.props.lastError = input.reason;
  }

  markNotProcessable(occurredAt: Date): void {
    this.transitionTo(DocumentExtractionStatus.NotProcessable, occurredAt);
  }

  /** Seule transition sortante de FAILED (mission §16 — retry explicite, jamais automatique
   *  au-delà de la politique de retry, voir ExtractionRetryPolicy). Cible toujours READY : la
   *  stratégie n'est plus jamais réputée acquise d'un cycle à l'autre (correction P1-02 —
   *  l'inspection est intégralement refaite à chaque cycle, y compris un retry). */
  resetForRetry(occurredAt: Date): void {
    this.transitionTo(DocumentExtractionStatus.Ready, occurredAt);
    this.props.lastError = undefined;
  }

  get documentId(): string {
    return this.props.documentId;
  }
  get dceId(): string {
    return this.props.dceId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get status(): DocumentExtractionStatus {
    return this.props.status;
  }
  get strategy(): DocumentExtractionStrategy | undefined {
    return this.props.strategy;
  }
  get attemptCount(): number {
    return this.props.attemptCount;
  }
  get pageCount(): number | undefined {
    return this.props.pageCount;
  }
  get characterCount(): number | undefined {
    return this.props.characterCount;
  }
  get chunkCount(): number | undefined {
    return this.props.chunkCount;
  }
  get language(): string | undefined {
    return this.props.language;
  }
  get warnings(): string[] {
    return this.props.warnings;
  }
  get lastError(): string | undefined {
    return this.props.lastError;
  }
  get contentChecksum(): string | undefined {
    return this.props.contentChecksum;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
