import { SubmissionProof } from "../domain/submission-proof.entity";
import type { SubmissionProofType } from "../domain/submission-proof-type";

export type PersistedSubmissionProof = {
  id: string;
  submissionId: string;
  organizationId: string;
  documentId: string;
  documentVersionId: string;
  proofType: string;
  hash: string;
  uploadedByUserId: string;
  uploadedAt: Date;
};

export function toDomainSubmissionProof(record: PersistedSubmissionProof): SubmissionProof {
  return SubmissionProof.rehydrate({
    id: record.id,
    submissionId: record.submissionId,
    organizationId: record.organizationId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    proofType: record.proofType as SubmissionProofType,
    hash: record.hash,
    uploadedByUserId: record.uploadedByUserId,
    uploadedAt: record.uploadedAt,
  });
}

export function toSubmissionProofRow(proof: SubmissionProof) {
  return {
    id: proof.id,
    submissionId: proof.submissionId,
    organizationId: proof.organizationId,
    documentId: proof.documentId,
    documentVersionId: proof.documentVersionId,
    proofType: proof.proofType,
    hash: proof.hash,
    uploadedByUserId: proof.uploadedByUserId,
    uploadedAt: proof.uploadedAt,
  };
}
