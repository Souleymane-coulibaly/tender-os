import type { PackageFile } from "../../domain/package-file";
import type { SubmissionPackage } from "../../domain/submission-package.aggregate";
import type { SubmissionPackageResponsePackageProvenance } from "../../domain/submission-package-response-package-provenance";

export type SubmissionPackageResponsePackageProvenanceInput = Readonly<{ lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }>;

export type SubmissionPackageWithFiles = { pkg: SubmissionPackage; files: readonly PackageFile[]; responsePackageProvenance: readonly SubmissionPackageResponsePackageProvenance[] };

export interface SubmissionPackageRepository {
  /** Crée le package PENDING, ses fichiers, et sa provenance multi-lot le cas échéant (mode LOT
   *  uniquement, mission §69, même discipline que `ExportJobRepository.create`), en une seule
   *  transaction courte. */
  create(input: { pkg: SubmissionPackage; files: readonly PackageFile[]; responsePackageProvenance?: readonly SubmissionPackageResponsePackageProvenanceInput[] }): Promise<void>;
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
