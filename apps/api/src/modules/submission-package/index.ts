export { SubmissionPackageModule } from "./submission-package.module";

export { GetSubmissionPackageUseCase } from "./application/use-cases/get-submission-package.use-case";
export { ListSubmissionPackagesUseCase } from "./application/use-cases/list-submission-packages.use-case";

export type { SubmissionPackageSummary, PackageFileSummary, SubmissionPackageManifest } from "./application/dtos";
export { PackageStatus } from "./domain/package-status";
// Réexporté pour Sprint 9 (module `submission`) — identifie le fichier manifest.json parmi
// `SubmissionPackageSummary.files` pour en dériver `manifestHash` (correctif audit Codex P1),
// jamais une seconde catégorisation divergente des fichiers du package.
export { PackageFileSourceType } from "./domain/package-file";
