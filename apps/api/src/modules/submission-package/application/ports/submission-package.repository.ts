import type { PackageFile } from "../../domain/package-file";
import type { SubmissionPackage } from "../../domain/submission-package.aggregate";

export type SubmissionPackageWithFiles = { pkg: SubmissionPackage; files: readonly PackageFile[] };

export interface SubmissionPackageRepository {
  /** Crée le package PENDING et ses fichiers en une seule transaction courte (mission §69, même
   *  discipline que `ExportJobRepository.create`). */
  create(input: { pkg: SubmissionPackage; files: readonly PackageFile[] }): Promise<void>;
  findById(input: { organizationId: string; packageId: string }): Promise<SubmissionPackageWithFiles | null>;
  listForTender(input: { organizationId: string; tenderId: string }): Promise<readonly SubmissionPackageWithFiles[]>;
  findLatestCompletedForTender(input: { organizationId: string; tenderId: string }): Promise<SubmissionPackageWithFiles | null>;
  /** Numéro de version suivant, PAR tenderId — mission §53 "un nouveau contenu produit une
   *  nouvelle ligne, jamais une mise à jour en place". */
  nextVersion(input: { organizationId: string; tenderId: string }): Promise<number>;
  markGenerating(input: { organizationId: string; packageId: string }): Promise<void>;
  /** Transaction courte : enregistre le ZIP final ET marque COMPLETED atomiquement. */
  completeWithArchive(input: {
    organizationId: string;
    packageId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileHash: string;
    storageKey: string;
    manifestJson: unknown;
    occurredAt: Date;
  }): Promise<void>;
  markFailed(input: { organizationId: string; packageId: string; errorCode: string; errorMessage: string; occurredAt: Date }): Promise<void>;
}

export const SUBMISSION_PACKAGE_REPOSITORY = Symbol("SUBMISSION_PACKAGE_REPOSITORY");
