import { AnalysisStatus } from "../../domain/analysis-status";
import type { AnalysisJob } from "../../domain/analysis-job.aggregate";
import { AnalysisNotRetryableError, AnalysisRetryLimitExceededError } from "../../domain/errors";

/**
 * Mission §"Timeout et retry"/"reprise après erreur" — jamais un retry indéfini : `maxRetries`
 * borne le nombre de tentatives SUPPLÉMENTAIRES après la première (donc `1 + maxRetries`
 * réservations au total). Seul un job FAILED peut être relancé explicitement — même motif que
 * `assertExtractionIsRetryable` (module Extraction).
 */
export function assertAnalysisIsRetryable(job: AnalysisJob, maxRetries: number): void {
  if (job.status !== AnalysisStatus.Failed) {
    throw new AnalysisNotRetryableError({ status: job.status });
  }
  if (job.attemptCount >= 1 + maxRetries) {
    throw new AnalysisRetryLimitExceededError({ maxAttempts: 1 + maxRetries });
  }
}
