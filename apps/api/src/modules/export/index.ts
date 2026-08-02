export { ExportModule } from "./export.module";

// Réexportés pour permettre à Validation/Signature/Package (Sprint 8A bis) de lire les exports
// finaux et de déclencher un figeage FINAL après approbation — jamais une seconde écriture sur ces
// tables (même motif que la réexportation de GetTenderUseCase par Tenders).
export { GetExportJobUseCase } from "./application/use-cases/get-export-job.use-case";
export type { GetExportJobQuery } from "./application/use-cases/get-export-job.use-case";
export { ListExportHistoryUseCase } from "./application/use-cases/list-export-history.use-case";
export { DownloadExportArtifactUseCase } from "./application/use-cases/download-export-artifact.use-case";
export type { ExportArtifactDownload } from "./application/use-cases/download-export-artifact.use-case";
export { GenerateFinalExportUseCase } from "./application/use-cases/generate-final-export.use-case";
export type { GenerateFinalExportCommand } from "./application/use-cases/generate-final-export.use-case";

export type { ExportJobSummary, ExportArtifactSummary, ExportTemplateSummary } from "./application/dtos";

export { EXPORT_JOB_REPOSITORY } from "./application/ports/export-job.repository";
export type { ExportJobRepository, ExportJobWithArtifact } from "./application/ports/export-job.repository";
// Réexporté en LECTURE SEULE pour permettre à Validation de lire la configuration du template
// (sections obligatoires) utilisée par un export précis — jamais une seconde écriture.
export { EXPORT_TEMPLATE_REPOSITORY } from "./application/ports/export-template.repository";
export type { ExportTemplateRepository } from "./application/ports/export-template.repository";
export type { ExportTemplateConfig, ExportTemplateSectionConfig } from "./domain/export-template-config";

export { ExportMode } from "./domain/export-mode";
export { ExportStatus } from "./domain/export-status";
export { ExportJobNotFoundError, ExportArtifactNotFoundError } from "./domain/errors";
