import type { SubmissionProof } from "../../domain/submission-proof.entity";

export interface SubmissionProofRepository {
  create(proof: SubmissionProof): Promise<void>;
  findById(input: { organizationId: string; proofId: string }): Promise<SubmissionProof | null>;
  listBySubmission(input: { organizationId: string; submissionId: string }): Promise<readonly SubmissionProof[]>;
}

export const SUBMISSION_PROOF_REPOSITORY = Symbol("SUBMISSION_PROOF_REPOSITORY");
