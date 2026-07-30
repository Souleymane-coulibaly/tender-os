import type { AnalysisAttempt } from "../../domain/analysis-attempt.entity";

/** Append-only (mission §"Versionnement"/"historique") — jamais de mise à jour ni de suppression
 *  d'une tentative déjà enregistrée. */
export interface AnalysisAttemptRepository {
  create(attempt: AnalysisAttempt): Promise<void>;
  listByJobId(input: { organizationId: string; jobId: string }): Promise<AnalysisAttempt[]>;
}

export const ANALYSIS_ATTEMPT_REPOSITORY = Symbol("ANALYSIS_ATTEMPT_REPOSITORY");
