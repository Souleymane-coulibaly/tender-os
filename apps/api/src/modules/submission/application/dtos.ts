import type { SubmissionProof } from "../domain/submission-proof.entity";
import type { SubmissionResponsePackageProvenance } from "../domain/submission-response-package-provenance";
import type { TenderSubmission } from "../domain/tender-submission.aggregate";

export type SubmissionResponsePackageProvenanceSummary = {
  lotId: string;
  responsePackageVersionId: string;
  responsePackageArtifactId: string;
  artifactChecksum: string;
};

export function toSubmissionResponsePackageProvenanceSummary(provenance: SubmissionResponsePackageProvenance): SubmissionResponsePackageProvenanceSummary {
  return { lotId: provenance.lotId, responsePackageVersionId: provenance.responsePackageVersionId, responsePackageArtifactId: provenance.responsePackageArtifactId, artifactChecksum: provenance.artifactChecksum };
}

export type SubmissionProofSummary = {
  id: string;
  submissionId: string;
  documentId: string;
  documentVersionId: string;
  proofType: string;
  hash: string;
  uploadedByUserId: string;
  uploadedAt: string;
};

export function toSubmissionProofSummary(proof: SubmissionProof): SubmissionProofSummary {
  return {
    id: proof.id,
    submissionId: proof.submissionId,
    documentId: proof.documentId,
    documentVersionId: proof.documentVersionId,
    proofType: proof.proofType,
    hash: proof.hash,
    uploadedByUserId: proof.uploadedByUserId,
    uploadedAt: proof.uploadedAt.toISOString(),
  };
}

export type TenderSubmissionSummary = {
  id: string;
  tenderId: string;
  packageId: string;
  packageVersion: number;
  packageHash: string;
  manifestHash?: string | undefined;
  /** TENDEROS-2.1-P2.2-F2 — dossier de réponse V2 réellement soumis, `undefined` si non résolvable
   *  sans ambiguïté au moment du dépôt (voir `GetSubmittableResponsePackageVersionUseCase`). */
  responsePackageVersionId?: string | undefined;
  responsePackageArtifactId?: string | undefined;
  responsePackageArtifactChecksum?: string | undefined;
  status: string;
  submittedByUserId?: string | undefined;
  submittedAt?: string | undefined;
  platform: string;
  customPlatformName?: string | undefined;
  platformReference?: string | undefined;
  receiptReference?: string | undefined;
  notes?: string | undefined;
  supersedesSubmissionId?: string | undefined;
  replacedBySubmissionId?: string | undefined;
  withdrawnAt?: string | undefined;
  withdrawnByUserId?: string | undefined;
  withdrawalReason?: string | undefined;
  cancelledAt?: string | undefined;
  cancelledByUserId?: string | undefined;
  cancellationReason?: string | undefined;
  rejectionCategory?: string | undefined;
  rejectionDescription?: string | undefined;
  receiptConfirmedAt?: string | undefined;
  receiptConfirmedByUserId?: string | undefined;
  externalSubmissionUrl?: string | undefined;
  createdAt: string;
  updatedAt: string;
  proofs: readonly SubmissionProofSummary[];
  /** Checkpoint TENDEROS-2.1-P2.2-F2.3 — provenance MULTI-LOT (mode LOT uniquement), une entrée par
   *  lot requis résolu au dépôt. Vide pour le mode global (les 3 champs scalaires ci-dessus suffisent
   *  alors) et pour toute Submission antérieure à F2.3 (jamais backfillé). */
  responsePackages: readonly SubmissionResponsePackageProvenanceSummary[];
};

export function toTenderSubmissionSummary(
  submission: TenderSubmission,
  proofs: readonly SubmissionProof[],
  responsePackageProvenance: readonly SubmissionResponsePackageProvenance[] = [],
): TenderSubmissionSummary {
  return {
    id: submission.id,
    tenderId: submission.tenderId,
    packageId: submission.packageId,
    packageVersion: submission.packageVersion,
    packageHash: submission.packageHash,
    manifestHash: submission.manifestHash,
    responsePackageVersionId: submission.responsePackageVersionId,
    responsePackageArtifactId: submission.responsePackageArtifactId,
    responsePackageArtifactChecksum: submission.responsePackageArtifactChecksum,
    status: submission.status,
    submittedByUserId: submission.submittedByUserId,
    submittedAt: submission.submittedAt?.toISOString(),
    platform: submission.platform,
    customPlatformName: submission.customPlatformName,
    platformReference: submission.platformReference,
    receiptReference: submission.receiptReference,
    notes: submission.notes,
    supersedesSubmissionId: submission.supersedesSubmissionId,
    replacedBySubmissionId: submission.replacedBySubmissionId,
    withdrawnAt: submission.withdrawnAt?.toISOString(),
    withdrawnByUserId: submission.withdrawnByUserId,
    withdrawalReason: submission.withdrawalReason,
    cancelledAt: submission.cancelledAt?.toISOString(),
    cancelledByUserId: submission.cancelledByUserId,
    cancellationReason: submission.cancellationReason,
    rejectionCategory: submission.rejectionCategory,
    rejectionDescription: submission.rejectionDescription,
    receiptConfirmedAt: submission.receiptConfirmedAt?.toISOString(),
    receiptConfirmedByUserId: submission.receiptConfirmedByUserId,
    externalSubmissionUrl: submission.externalSubmissionUrl,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    proofs: proofs.map(toSubmissionProofSummary),
    responsePackages: responsePackageProvenance.map(toSubmissionResponsePackageProvenanceSummary),
  };
}
