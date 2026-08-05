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

// Réexportés pour Sprint 8A.1 (Deliverables) — `DeliverableRevision.contentStructured` réutilise
// DIRECTEMENT cette IR (jamais une IR dupliquée) pour son contenu structuré éditable, et
// `PreviewExportUseCase`/`GenerateFinalExportUseCase` (déjà réexportés ci-dessus) pour assembler
// l'export d'un Deliverable via le MÊME pipeline de rendu DOCX/PDF que le Sprint 8A.
export type { RenderableBlock, RenderableDocument, RenderableSection, RichTextRun } from "./application/services/renderable-document";
export { PreviewExportUseCase } from "./application/use-cases/preview-export.use-case";
export type { PreviewExportCommand } from "./application/use-cases/preview-export.use-case";
export type { SectionSelectionInput } from "./application/services/section-content-resolver.service";
export { ExportSectionSource } from "./domain/export-section-source";

export { ExportMode } from "./domain/export-mode";
export { ExportStatus } from "./domain/export-status";
export { ExportJobNotFoundError, ExportArtifactNotFoundError } from "./domain/errors";

// Réexporté pour Sprint 8C Phase 3 (`administrative-dossier`) — génère des PDF pour les pièces
// administratives structurées (DC1/DC2/DC4/DUME/Acte d'engagement) en réutilisant DIRECTEMENT ce
// renderer, jamais un second moteur PDF parallèle (règle absolue du projet).
export { PDF_RENDERER } from "./application/ports/pdf-renderer";
export type { PdfRendererPort } from "./application/ports/pdf-renderer";

// Réexporté pour Sprint 8C.1 (`administrative-dossier`) — génère l'Annexe TenderOS (DOCX) des
// formulaires officiels (DC1/DC2/DC4/ATTRI1) via ce MÊME renderer, jamais un second moteur DOCX.
export { DOCUMENT_RENDERER } from "./application/ports/document-renderer";
export type { DocumentRendererPort } from "./application/ports/document-renderer";
