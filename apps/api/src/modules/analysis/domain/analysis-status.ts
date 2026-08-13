import { InvalidAnalysisStatusError } from "./errors";

/**
 * Cycle de vie d'un job d'analyse IA (mission Sprint 4.1) — même motif que
 * `DocumentExtractionStatus` (module Extraction, Sprint 3) : réservation atomique courte
 * (QUEUED → PROCESSING), traitement hors transaction, finalisation atomique courte. `CANCELLED`
 * est un état terminal atteignable uniquement par une action explicite (jamais automatique).
 */
export const AnalysisStatus = {
  Pending: "PENDING",
  Queued: "QUEUED",
  Processing: "PROCESSING",
  Succeeded: "SUCCEEDED",
  PartiallySucceeded: "PARTIALLY_SUCCEEDED",
  Failed: "FAILED",
  Cancelled: "CANCELLED",
} as const;

export type AnalysisStatus = (typeof AnalysisStatus)[keyof typeof AnalysisStatus];

/**
 * Funnel explicite : PENDING → QUEUED (dispatch accepté) → PROCESSING (réservation atomique
 * courte) → état terminal. FAILED → QUEUED autorise un retry explicite (voir AnalysisRetryPolicy).
 * PENDING/QUEUED/PROCESSING → CANCELLED autorise une annulation explicite (jamais depuis un état
 * terminal). Aucun autre état terminal ne rouvre jamais.
 */
export const ALLOWED_ANALYSIS_TRANSITIONS: Record<AnalysisStatus, readonly AnalysisStatus[]> = {
  [AnalysisStatus.Pending]: [AnalysisStatus.Queued, AnalysisStatus.Cancelled],
  [AnalysisStatus.Queued]: [AnalysisStatus.Processing, AnalysisStatus.Cancelled],
  [AnalysisStatus.Processing]: [
    AnalysisStatus.Succeeded,
    AnalysisStatus.PartiallySucceeded,
    AnalysisStatus.Failed,
    AnalysisStatus.Cancelled,
    // Sprint 21 (hardening) — mission PARTIE F : un job resté PROCESSING au-delà d'un seuil (crash
    // process en plein appel provider, jamais suivi de finalizeAttempt) doit pouvoir être repris
    // automatiquement, jamais bloqué indéfiniment en attente d'un retry manuel. Voir
    // `AnalysisJob.reclaimStale()` / `ReclaimStaleAnalysisJobsUseCase`.
    AnalysisStatus.Queued,
  ],
  [AnalysisStatus.Failed]: [AnalysisStatus.Queued],
  [AnalysisStatus.Succeeded]: [],
  [AnalysisStatus.PartiallySucceeded]: [],
  [AnalysisStatus.Cancelled]: [],
};

export function isAnalysisStatus(value: string): value is AnalysisStatus {
  return Object.values(AnalysisStatus).includes(value as AnalysisStatus);
}

export function parseAnalysisStatus(value: string): AnalysisStatus {
  if (!isAnalysisStatus(value)) {
    throw new InvalidAnalysisStatusError(value);
  }
  return value;
}

export function isTerminalAnalysisStatus(status: AnalysisStatus): boolean {
  return ALLOWED_ANALYSIS_TRANSITIONS[status].length === 0;
}
