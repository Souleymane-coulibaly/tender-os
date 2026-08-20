import { TenderSubmission } from "../domain/tender-submission.aggregate";
import type { SubmissionPlatform } from "../domain/submission-platform";
import type { SubmissionRejectionCategory } from "../domain/submission-rejection-category";
import type { TenderSubmissionStatus } from "../domain/tender-submission-status";

export type PersistedTenderSubmission = {
  id: string;
  organizationId: string;
  tenderId: string;
  packageId: string;
  packageVersion: number;
  packageHash: string;
  manifestHash: string | null;
  responsePackageVersionId: string | null;
  responsePackageArtifactId: string | null;
  responsePackageArtifactChecksum: string | null;
  status: string;
  submittedByUserId: string | null;
  submittedAt: Date | null;
  platform: string;
  customPlatformName: string | null;
  platformReference: string | null;
  receiptReference: string | null;
  notes: string | null;
  supersedesSubmissionId: string | null;
  replacedBySubmissionId: string | null;
  withdrawnAt: Date | null;
  withdrawnByUserId: string | null;
  withdrawalReason: string | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  rejectionCategory: string | null;
  rejectionDescription: string | null;
  receiptConfirmedAt: Date | null;
  receiptConfirmedByUserId: string | null;
  externalSubmissionUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainTenderSubmission(record: PersistedTenderSubmission): TenderSubmission {
  return TenderSubmission.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    packageId: record.packageId,
    packageVersion: record.packageVersion,
    packageHash: record.packageHash,
    manifestHash: record.manifestHash ?? undefined,
    responsePackageVersionId: record.responsePackageVersionId ?? undefined,
    responsePackageArtifactId: record.responsePackageArtifactId ?? undefined,
    responsePackageArtifactChecksum: record.responsePackageArtifactChecksum ?? undefined,
    status: record.status as TenderSubmissionStatus,
    submittedByUserId: record.submittedByUserId ?? undefined,
    submittedAt: record.submittedAt ?? undefined,
    platform: record.platform as SubmissionPlatform,
    customPlatformName: record.customPlatformName ?? undefined,
    platformReference: record.platformReference ?? undefined,
    receiptReference: record.receiptReference ?? undefined,
    notes: record.notes ?? undefined,
    supersedesSubmissionId: record.supersedesSubmissionId ?? undefined,
    replacedBySubmissionId: record.replacedBySubmissionId ?? undefined,
    withdrawnAt: record.withdrawnAt ?? undefined,
    withdrawnByUserId: record.withdrawnByUserId ?? undefined,
    withdrawalReason: record.withdrawalReason ?? undefined,
    cancelledAt: record.cancelledAt ?? undefined,
    cancelledByUserId: record.cancelledByUserId ?? undefined,
    cancellationReason: record.cancellationReason ?? undefined,
    rejectionCategory: (record.rejectionCategory as SubmissionRejectionCategory | null) ?? undefined,
    rejectionDescription: record.rejectionDescription ?? undefined,
    receiptConfirmedAt: record.receiptConfirmedAt ?? undefined,
    receiptConfirmedByUserId: record.receiptConfirmedByUserId ?? undefined,
    externalSubmissionUrl: record.externalSubmissionUrl ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toTenderSubmissionRow(submission: TenderSubmission) {
  return {
    id: submission.id,
    organizationId: submission.organizationId,
    tenderId: submission.tenderId,
    packageId: submission.packageId,
    packageVersion: submission.packageVersion,
    packageHash: submission.packageHash,
    manifestHash: submission.manifestHash ?? null,
    responsePackageVersionId: submission.responsePackageVersionId ?? null,
    responsePackageArtifactId: submission.responsePackageArtifactId ?? null,
    responsePackageArtifactChecksum: submission.responsePackageArtifactChecksum ?? null,
    status: submission.status,
    submittedByUserId: submission.submittedByUserId ?? null,
    submittedAt: submission.submittedAt ?? null,
    platform: submission.platform,
    customPlatformName: submission.customPlatformName ?? null,
    platformReference: submission.platformReference ?? null,
    receiptReference: submission.receiptReference ?? null,
    notes: submission.notes ?? null,
    supersedesSubmissionId: submission.supersedesSubmissionId ?? null,
    replacedBySubmissionId: submission.replacedBySubmissionId ?? null,
    withdrawnAt: submission.withdrawnAt ?? null,
    withdrawnByUserId: submission.withdrawnByUserId ?? null,
    withdrawalReason: submission.withdrawalReason ?? null,
    cancelledAt: submission.cancelledAt ?? null,
    cancelledByUserId: submission.cancelledByUserId ?? null,
    cancellationReason: submission.cancellationReason ?? null,
    rejectionCategory: submission.rejectionCategory ?? null,
    rejectionDescription: submission.rejectionDescription ?? null,
    receiptConfirmedAt: submission.receiptConfirmedAt ?? null,
    receiptConfirmedByUserId: submission.receiptConfirmedByUserId ?? null,
    externalSubmissionUrl: submission.externalSubmissionUrl ?? null,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}
