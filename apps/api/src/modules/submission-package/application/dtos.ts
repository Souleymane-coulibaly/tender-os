import type { PackageFile } from "../domain/package-file";
import type { SubmissionPackage } from "../domain/submission-package.aggregate";

export type SubmissionPackageResponsePackageSummary = { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string };

/** Accepte n'importe quelle forme portant AU MOINS ces 4 champs métier — le type domaine complet
 *  (`SubmissionPackageResponsePackageProvenance`, relu en base) comme la forme construite localement
 *  juste après écriture (`SubmissionPackageResponsePackageProvenanceInput`, sans id/createdAt) sont
 *  tous deux assignables ici, jamais une seconde lecture DB requise (mission "jamais recalculé après
 *  coup"). */
export function toSubmissionPackageResponsePackageSummary(p: SubmissionPackageResponsePackageSummary): SubmissionPackageResponsePackageSummary {
  return { lotId: p.lotId, responsePackageVersionId: p.responsePackageVersionId, responsePackageArtifactId: p.responsePackageArtifactId, artifactChecksum: p.artifactChecksum };
}

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
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1 — permet à tout consommateur de l'API de PROUVER que ce
   *  package est bien le wrapper du `PackageArtifact` V2 exact certifié par la Submission Readiness
   *  (mission "SubmissionPackage X = wrapper du PackageArtifact V2 Y"). `undefined` pour un package
   *  antérieur à ce checkpoint. */
  responsePackageVersionId?: string | undefined;
  responsePackageArtifactId?: string | undefined;
  responsePackageArtifactChecksum?: string | undefined;
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — provenance MULTI-LOT (mode LOT, mission "ne
   *  jamais refuser un N≥2 représentable sans ambiguïté"), une entrée par lot requis. Vide en mode
   *  GLOBAL (les 3 champs scalaires ci-dessus sont alors seuls renseignés) — jamais les deux à la
   *  fois, même discipline que `TenderSubmissionSummary.responsePackages`. */
  responsePackages: readonly SubmissionPackageResponsePackageSummary[];
  createdAt: string;
  completedAt?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

export function toSubmissionPackageSummary(input: { pkg: SubmissionPackage; files: readonly PackageFile[]; responsePackageProvenance?: readonly SubmissionPackageResponsePackageSummary[] }): SubmissionPackageSummary {
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
    responsePackageVersionId: input.pkg.responsePackageVersionId,
    responsePackageArtifactId: input.pkg.responsePackageArtifactId,
    responsePackageArtifactChecksum: input.pkg.responsePackageArtifactChecksum,
    responsePackages: (input.responsePackageProvenance ?? []).map(toSubmissionPackageResponsePackageSummary),
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
