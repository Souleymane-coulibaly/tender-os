import type { TenderSubmission } from "../../domain/tender-submission.aggregate";

export interface TenderSubmissionRepository {
  create(submission: TenderSubmission): Promise<void>;
  findById(input: { organizationId: string; submissionId: string }): Promise<TenderSubmission | null>;
  /** La soumission "en vol" (SUBMISSION_IN_PROGRESS/SUBMITTED/RECEIPT_CONFIRMED) de ce Tender, s'il
   *  y en a une — jamais plus d'une à la fois (mission §31/§32, filet DB + application). */
  findActiveForTender(input: { organizationId: string; tenderId: string }): Promise<TenderSubmission | null>;
  /** Historique complet, jamais filtré — mission §17 "conserver un historique complet et non
   *  destructif". */
  listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly TenderSubmission[]>;
  save(submission: TenderSubmission): Promise<void>;
  /** Mission §14/§32 — remplacement ATOMIQUE : l'ancienne passe à REPLACED et la nouvelle est créée
   *  dans UNE SEULE transaction, jamais deux écritures séparées qui pourraient diverger. */
  replaceActive(input: { previous: TenderSubmission; next: TenderSubmission }): Promise<void>;
}

export const TENDER_SUBMISSION_REPOSITORY = Symbol("TENDER_SUBMISSION_REPOSITORY");
