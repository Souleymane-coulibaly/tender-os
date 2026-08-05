import type { SubmissionProofType } from "./submission-proof-type";

export type SubmissionProofProps = {
  id: string;
  submissionId: string;
  organizationId: string;
  documentId: string;
  documentVersionId: string;
  proofType: SubmissionProofType;
  hash: string;
  uploadedByUserId: string;
  uploadedAt: Date;
};

/**
 * Sprint 9 — mission §12 : une preuve de dépôt, liée à un `Document` déjà vérifié (jamais de
 * binaire en base, jamais un import profond — voir `verify-attachable-document.ts` local à ce
 * module). Plusieurs preuves peuvent exister pour une même soumission (mission "types de preuve
 * possibles" au pluriel) — jamais une seule preuve remplacée en place.
 */
export class SubmissionProof {
  private constructor(private props: SubmissionProofProps) {}

  static create(input: {
    id: string;
    submissionId: string;
    organizationId: string;
    documentId: string;
    documentVersionId: string;
    proofType: SubmissionProofType;
    hash: string;
    uploadedByUserId: string;
    occurredAt: Date;
  }): SubmissionProof {
    return new SubmissionProof({
      id: input.id,
      submissionId: input.submissionId,
      organizationId: input.organizationId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      proofType: input.proofType,
      hash: input.hash,
      uploadedByUserId: input.uploadedByUserId,
      uploadedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SubmissionProofProps): SubmissionProof {
    return new SubmissionProof(props);
  }

  get id(): string {
    return this.props.id;
  }
  get submissionId(): string {
    return this.props.submissionId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get documentVersionId(): string {
    return this.props.documentVersionId;
  }
  get proofType(): SubmissionProofType {
    return this.props.proofType;
  }
  get hash(): string {
    return this.props.hash;
  }
  get uploadedByUserId(): string {
    return this.props.uploadedByUserId;
  }
  get uploadedAt(): Date {
    return this.props.uploadedAt;
  }
}
