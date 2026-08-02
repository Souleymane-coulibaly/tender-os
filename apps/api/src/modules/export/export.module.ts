import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { GenerationModule } from "../generation";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { PricingModule } from "../pricing";
import { TendersModule } from "../tenders";
import { EXPORT_JOB_REPOSITORY } from "./application/ports/export-job.repository";
import { EXPORT_TEMPLATE_REPOSITORY } from "./application/ports/export-template.repository";
import { DOCUMENT_RENDERER } from "./application/ports/document-renderer";
import { PDF_RENDERER } from "./application/ports/pdf-renderer";
import { ActivateExportTemplateVersionUseCase } from "./application/use-cases/activate-export-template-version.use-case";
import { CreateExportTemplateUseCase } from "./application/use-cases/create-export-template.use-case";
import { CreateExportTemplateVersionUseCase } from "./application/use-cases/create-export-template-version.use-case";
import { DownloadExportArtifactUseCase } from "./application/use-cases/download-export-artifact.use-case";
import { GenerateFinalExportUseCase } from "./application/use-cases/generate-final-export.use-case";
import { GetExportJobUseCase } from "./application/use-cases/get-export-job.use-case";
import { ListExportHistoryUseCase } from "./application/use-cases/list-export-history.use-case";
import { ListExportTemplatesUseCase } from "./application/use-cases/list-export-templates.use-case";
import { PreviewExportUseCase } from "./application/use-cases/preview-export.use-case";
import { ExportRenderPipelineService } from "./application/services/export-render-pipeline.service";
import { SectionContentResolverService } from "./application/services/section-content-resolver.service";
import { DocxDocumentRenderer } from "./infrastructure/docx-document.renderer";
import { PdfmakeDocumentRenderer } from "./infrastructure/pdfmake-document.renderer";
import { PrismaExportJobRepository } from "./infrastructure/prisma-export-job.repository";
import { PrismaExportTemplateRepository } from "./infrastructure/prisma-export-template.repository";
import { ExportController } from "./interfaces/http/export.controller";
import { ExportTemplatesController } from "./interfaces/http/export-templates.controller";

/**
 * Module Export (Sprint 8A) — importe `TendersModule`/`ClientPortfolioModule`/`GenerationModule`/
 * `PricingModule`/`DocumentsModule` dans UN SEUL sens (réutilise `GetTenderUseCase`,
 * `AssertClientAccessUseCase`, `GetGenerationUseCase`/`GetPricingEstimateUseCase` en LECTURE
 * SEULE, `StorageProvider`) : aucun de ces modules n'importe jamais Export en retour, évitant tout
 * cycle Nest (même motif que Generation → Analysis, Sprint 6). Validation/Signature/Package
 * (Sprint 8A bis) importeront ExportModule dans ce même sens unique, jamais l'inverse.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, GenerationModule, PricingModule, DocumentsModule],
  controllers: [ExportController, ExportTemplatesController],
  providers: [
    CreateExportTemplateUseCase,
    CreateExportTemplateVersionUseCase,
    ActivateExportTemplateVersionUseCase,
    ListExportTemplatesUseCase,
    PreviewExportUseCase,
    GenerateFinalExportUseCase,
    GetExportJobUseCase,
    ListExportHistoryUseCase,
    DownloadExportArtifactUseCase,

    SectionContentResolverService,
    ExportRenderPipelineService,

    { provide: EXPORT_TEMPLATE_REPOSITORY, useClass: PrismaExportTemplateRepository },
    { provide: EXPORT_JOB_REPOSITORY, useClass: PrismaExportJobRepository },
    { provide: DOCUMENT_RENDERER, useClass: DocxDocumentRenderer },
    { provide: PDF_RENDERER, useClass: PdfmakeDocumentRenderer },
  ],
  // Réexportés pour permettre à Validation/Signature/Package (Sprint 8A bis) de lire les exports
  // finaux et de déclencher un figeage FINAL après approbation — jamais une seconde écriture sur
  // ces tables (même motif que le réexport de `GetTenderUseCase` par Tenders).
  exports: [GetExportJobUseCase, ListExportHistoryUseCase, DownloadExportArtifactUseCase, GenerateFinalExportUseCase, EXPORT_JOB_REPOSITORY, EXPORT_TEMPLATE_REPOSITORY],
})
export class ExportModule {}
