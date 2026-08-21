import type { TenderSubmission } from "../../domain/tender-submission.aggregate";
import type { SubmissionResponsePackageProvenance } from "../../domain/submission-response-package-provenance";

/** Checkpoint TENDEROS-2.1-P2.2-F2.3 — une ligne à créer, sans `id`/`createdAt` (calculés à
 *  l'écriture, même motif que le reste du module). */
export type SubmissionResponsePackageProvenanceInput = Readonly<{ lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }>;

export interface TenderSubmissionRepository {
  /** `responsePackageProvenance` (mission §19/§20) — écrite dans la MÊME transaction que la
   *  Submission : jamais un dépôt SUCCESS avec une provenance multi-lot partielle. Vide/omis pour
   *  le mode global (les 3 colonnes scalaires F2 suffisent alors). */
  create(submission: TenderSubmission, responsePackageProvenance?: readonly SubmissionResponsePackageProvenanceInput[]): Promise<void>;
  findById(input: { organizationId: string; submissionId: string }): Promise<TenderSubmission | null>;
  /** La soumission "en vol" (SUBMISSION_IN_PROGRESS/SUBMITTED/RECEIPT_CONFIRMED) de ce Tender, s'il
   *  y en a une — jamais plus d'une à la fois (mission §31/§32, filet DB + application). */
  findActiveForTender(input: { organizationId: string; tenderId: string }): Promise<TenderSubmission | null>;
  /** Historique complet, jamais filtré — mission §17 "conserver un historique complet et non
   *  destructif". */
  listByTender(input: { organizationId: string; tenderId: string }): Promise<readonly TenderSubmission[]>;
  save(submission: TenderSubmission, responsePackageProvenance?: readonly SubmissionResponsePackageProvenanceInput[]): Promise<void>;
  /** Mission §14/§32 — remplacement ATOMIQUE : l'ancienne passe à REPLACED et la nouvelle est créée
   *  dans UNE SEULE transaction, jamais deux écritures séparées qui pourraient diverger. */
  replaceActive(input: { previous: TenderSubmission; next: TenderSubmission; nextResponsePackageProvenance?: readonly SubmissionResponsePackageProvenanceInput[] }): Promise<void>;
  /** Provenance multi-lot figée pour cette Submission (mission §35 "identifier exactement les
   *  artefacts déposés") — jamais recalculée, jamais backfillée pour une Submission antérieure à
   *  F2.3 (retourne alors `[]`, le mode global reste porté par les 3 colonnes scalaires). */
  listResponsePackageProvenance(input: { organizationId: string; submissionId: string }): Promise<readonly SubmissionResponsePackageProvenance[]>;
}

export const TENDER_SUBMISSION_REPOSITORY = Symbol("TENDER_SUBMISSION_REPOSITORY");
