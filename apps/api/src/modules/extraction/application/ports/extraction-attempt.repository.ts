import type { ExtractionAttempt } from "../../domain/extraction-attempt.entity";

/** Append-only (mission §14 "historique") — jamais de mise à jour ni de suppression d'une
 *  tentative déjà enregistrée. */
export interface ExtractionAttemptRepository {
  create(attempt: ExtractionAttempt): Promise<void>;
  listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionAttempt[]>;
}

export const EXTRACTION_ATTEMPT_REPOSITORY = Symbol("EXTRACTION_ATTEMPT_REPOSITORY");
