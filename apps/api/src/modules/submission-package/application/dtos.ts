import type { PackageFile } from "../domain/package-file";
import type { SubmissionPackage } from "../domain/submission-package.aggregate";

export type PackageFileSummary = {
  archivePath: string;
  sourceType: string;
  sourceId?: string | undefined;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  order: number;
};

export function toPackageFileSummary(f: PackageFile): PackageFileSummary {
  return {
    archivePath: f.archivePath,
    sourceType: f.sourceType,
    sourceId: f.sourceId,
    fileName: f.fileName,
    mimeType: f.mimeType,
    fileSize: f.fileSize,
    fileHash: f.fileHash,
    order: f.order,
  };
}

export type SubmissionPackageSummary = {
  id: string;
  tenderId: string;
  version: number;
  status: string;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  files: readonly PackageFileSummary[];
  fileName?: string | undefined;
  mimeType?: string | undefined;
  fileSize?: number | undefined;
  fileHash?: string | undefined;
  createdAt: string;
  completedAt?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

export function toSubmissionPackageSummary(input: { pkg: SubmissionPackage; files: readonly PackageFile[] }): SubmissionPackageSummary {
  return {
    id: input.pkg.id,
    tenderId: input.pkg.tenderId,
    version: input.pkg.version,
    status: input.pkg.status,
    validationRunId: input.pkg.validationRunId,
    approvalId: input.pkg.approvalId,
    readinessStatus: input.pkg.readinessStatus,
    files: input.files.map(toPackageFileSummary),
    fileName: input.pkg.fileName,
    mimeType: input.pkg.mimeType,
    fileSize: input.pkg.fileSize,
    fileHash: input.pkg.fileHash,
    createdAt: input.pkg.createdAt.toISOString(),
    completedAt: input.pkg.completedAt?.toISOString(),
    errorCode: input.pkg.errorCode,
    errorMessage: input.pkg.errorMessage,
  };
}

/** Manifest persisté et embarqué dans le ZIP (mission §53 "manifest de package") — reconstruction
 *  complète, jamais recalculée après coup même si les sources changent ensuite. */
export type SubmissionPackageManifest = {
  packageId: string;
  tenderId: string;
  version: number;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  generatedAt: string;
  generatedBy: string;
  files: readonly {
    archivePath: string;
    sourceType: string;
    sourceId?: string | undefined;
    fileName: string;
    fileHash: string;
    fileSize: number;
  }[];
};
