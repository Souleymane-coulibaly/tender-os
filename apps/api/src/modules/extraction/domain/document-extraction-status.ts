import { InvalidDocumentExtractionStatusError } from "./extraction-errors";

/**
 * Cycle de vie fin d'une tentative d'extraction (mission Sprint 3 §5, révisé correction P1-02) —
 * jamais confondu avec `DceDocumentProcessingStatus` (Sprint 2, éligibilité grossière par
 * extension) ni avec le futur `READY_FOR_ANALYSIS` porté par `DceDocument` lui-même :
 * `DocumentExtraction` est le détail du pipeline, `DceDocument.processingStatus` n'en reçoit que
 * le résultat agrégé. Une seule machine d'état par granularité — jamais deux modélisations
 * concurrentes du même concept.
 *
 * `INSPECTING` a été retiré (correction P1-02) : l'inspection et la détection de stratégie sont
 * désormais des opérations HORS transaction (voir `ProcessDocumentExtractionUseCase`), exécutées
 * après une réservation atomique courte qui passe directement à `PROCESSING` — il n'existe plus
 * d'état persistant intermédiaire entre la réservation et la finalisation.
 */
export const DocumentExtractionStatus = {
  Pending: "PENDING",
  Ready: "READY",
  Processing: "PROCESSING",
  Succeeded: "SUCCEEDED",
  PartiallySucceeded: "PARTIALLY_SUCCEEDED",
  Failed: "FAILED",
  NotProcessable: "NOT_PROCESSABLE",
} as const;

export type DocumentExtractionStatus = (typeof DocumentExtractionStatus)[keyof typeof DocumentExtractionStatus];

/**
 * Funnel explicite (révisé P1-02) : PENDING|READY → PROCESSING (réservation atomique courte,
 * jamais d'opération longue) → état terminal (décidé à la finalisation, une fois l'inspection, la
 * stratégie et l'extraction déterminées hors transaction). FAILED → READY autorise un retry (voir
 * ExtractionRetryPolicy) ; les autres états terminaux ne rouvrent jamais.
 */
export const ALLOWED_DOCUMENT_EXTRACTION_TRANSITIONS: Record<
  DocumentExtractionStatus,
  readonly DocumentExtractionStatus[]
> = {
  [DocumentExtractionStatus.Pending]: [DocumentExtractionStatus.Processing],
  [DocumentExtractionStatus.Ready]: [DocumentExtractionStatus.Processing],
  [DocumentExtractionStatus.Processing]: [
    DocumentExtractionStatus.Succeeded,
    DocumentExtractionStatus.PartiallySucceeded,
    DocumentExtractionStatus.Failed,
    DocumentExtractionStatus.NotProcessable,
  ],
  [DocumentExtractionStatus.Failed]: [DocumentExtractionStatus.Ready],
  [DocumentExtractionStatus.Succeeded]: [],
  [DocumentExtractionStatus.PartiallySucceeded]: [],
  [DocumentExtractionStatus.NotProcessable]: [],
};

export function isDocumentExtractionStatus(value: string): value is DocumentExtractionStatus {
  return Object.values(DocumentExtractionStatus).includes(value as DocumentExtractionStatus);
}

export function parseDocumentExtractionStatus(value: string): DocumentExtractionStatus {
  if (!isDocumentExtractionStatus(value)) {
    throw new InvalidDocumentExtractionStatusError(value);
  }
  return value;
}

export function isTerminalDocumentExtractionStatus(status: DocumentExtractionStatus): boolean {
  return ALLOWED_DOCUMENT_EXTRACTION_TRANSITIONS[status].length === 0;
}
