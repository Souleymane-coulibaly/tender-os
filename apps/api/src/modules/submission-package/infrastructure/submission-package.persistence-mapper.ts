import { PackageFile, type PackageFileSourceType } from "../domain/package-file";
import type { PackageStatus } from "../domain/package-status";
import { SubmissionPackage } from "../domain/submission-package.aggregate";

export type PersistedPackageFile = {
  archivePath: string;
  sourceType: string;
  sourceId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  order: number;
};

export function toDomainPackageFile(record: PersistedPackageFile): PackageFile {
  return PackageFile.create({
    archivePath: record.archivePath,
    sourceType: record.sourceType as PackageFileSourceType,
    sourceId: record.sourceId ?? undefined,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    fileHash: record.fileHash,
    order: record.order,
  });
}

export type PersistedSubmissionPackage = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  version: number;
  status: string;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileHash: string | null;
  storageKey: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  files: readonly PersistedPackageFile[];
};

export function toDomainSubmissionPackage(record: PersistedSubmissionPackage): { pkg: SubmissionPackage; files: readonly PackageFile[] } {
  const files = record.files.map(toDomainPackageFile);
  const pkg = SubmissionPackage.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    version: record.version,
    status: record.status as PackageStatus,
    validationRunId: record.validationRunId,
    approvalId: record.approvalId,
    readinessStatus: record.readinessStatus,
    files,
    fileName: record.fileName ?? undefined,
    mimeType: record.mimeType ?? undefined,
    fileSize: record.fileSize ?? undefined,
    fileHash: record.fileHash ?? undefined,
    storageKey: record.storageKey ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? undefined,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
  });
  return { pkg, files };
}
