import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { ExportModule } from "../export";
import { GenerationModule } from "../generation";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { PricingModule } from "../pricing";
import { SignatureModule } from "../signature";
import { SubmissionPackageModule } from "../submission-package";
import { TendersModule } from "../tenders";
import { ValidationModule } from "../validation";

import { CHECKLIST_PIECE_ENTRY_REPOSITORY } from "./application/ports/checklist-piece-entry.repository";
import { COMPLIANCE_MATRIX_ENTRY_REPOSITORY } from "./application/ports/compliance-matrix-entry.repository";
import { DELIVERABLE_REPOSITORY } from "./application/ports/deliverable.repository";
import { DELIVERABLE_ANNEX_REPOSITORY } from "./application/ports/deliverable-annex.repository";
import { DELIVERABLE_COMMENT_REPOSITORY } from "./application/ports/deliverable-comment.repository";
import { DELIVERABLE_EXPORT_SELECTION_REPOSITORY } from "./application/ports/deliverable-export-selection.repository";
import { DELIVERABLE_REVIEW_REPOSITORY } from "./application/ports/deliverable-review.repository";
import { DELIVERABLE_REVISION_REPOSITORY } from "./application/ports/deliverable-revision.repository";
import { DELIVERABLE_SECTION_REPOSITORY } from "./application/ports/deliverable-section.repository";
import { DELIVERABLE_TEMPLATE_REPOSITORY } from "./application/ports/deliverable-template.repository";
import { DOCUMENT_THEME_REPOSITORY } from "./application/ports/document-theme.repository";

import { ActivateDeliverableTemplateVersionUseCase } from "./application/use-cases/activate-deliverable-template-version.use-case";
import { ActivateDocumentThemeVersionUseCase } from "./application/use-cases/activate-document-theme-version.use-case";
import { AddDeliverableCommentUseCase } from "./application/use-cases/add-deliverable-comment.use-case";
import { ApproveDeliverableUseCase } from "./application/use-cases/approve-deliverable.use-case";
import { CreateChecklistPieceEntryUseCase, ListChecklistPieceEntriesUseCase, UpdateChecklistPieceEntryUseCase } from "./application/use-cases/checklist-piece.use-cases";
import { CompareRevisionsUseCase } from "./application/use-cases/compare-revisions.use-case";
import { CreateComplianceMatrixEntryUseCase, ListComplianceMatrixEntriesUseCase, UpdateComplianceMatrixEntryUseCase, ValidateComplianceMatrixEntryUseCase } from "./application/use-cases/compliance-matrix.use-cases";
import { CreateDeliverableAnnexUseCase, ListDeliverableAnnexesUseCase } from "./application/use-cases/deliverable-annex.use-cases";
import { CreateDeliverableTemplateUseCase } from "./application/use-cases/create-deliverable-template.use-case";
import { CreateDeliverableTemplateVersionUseCase } from "./application/use-cases/create-deliverable-template-version.use-case";
import { CreateDocumentThemeUseCase } from "./application/use-cases/create-document-theme.use-case";
import { CreateDocumentThemeVersionUseCase } from "./application/use-cases/create-document-theme-version.use-case";
import { CreateManualRevisionUseCase } from "./application/use-cases/create-manual-revision.use-case";
import { CreateRevisionFromGenerationUseCase } from "./application/use-cases/create-revision-from-generation.use-case";
import { DecideRevisionReviewUseCase } from "./application/use-cases/decide-revision-review.use-case";
import { EnsureTenderDeliverablesUseCase } from "./application/use-cases/ensure-tender-deliverables.use-case";
import { GenerateDeliverableSectionUseCase } from "./application/use-cases/generate-deliverable-section.use-case";
import { GetDeliverableUseCase } from "./application/use-cases/get-deliverable.use-case";
import { ListDeliverablesUseCase } from "./application/use-cases/list-deliverables.use-case";
import { ListDeliverableTemplatesUseCase } from "./application/use-cases/list-deliverable-templates.use-case";
import { ListDocumentThemesUseCase } from "./application/use-cases/list-document-themes.use-case";
import { ListSectionRevisionsUseCase } from "./application/use-cases/list-section-revisions.use-case";
import { PreviewDeliverableUseCase } from "./application/use-cases/preview-deliverable.use-case";
import {
  GetDeliverableCostReportUseCase,
  GetDeliverableSignatureDocumentsUseCase,
  GetDeliverableSubmissionPackageUseCase,
  GetDeliverableValidationReportUseCase,
} from "./application/use-cases/read-only-deliverable-views.use-cases";
import { ResolveDeliverableCommentUseCase } from "./application/use-cases/resolve-deliverable-comment.use-case";
import { RestoreRevisionUseCase } from "./application/use-cases/restore-revision.use-case";
import { SelectCostReportEstimateUseCase } from "./application/use-cases/select-cost-report-estimate.use-case";
import { SaveRevisionDraftUseCase } from "./application/use-cases/save-revision-draft.use-case";
import { SelectRevisionForExportUseCase } from "./application/use-cases/select-revision-for-export.use-case";
import { SubmitRevisionForReviewUseCase, WithdrawRevisionFromReviewUseCase } from "./application/use-cases/submit-revision-for-review.use-case";
import { UpdateDeliverableSectionUseCase } from "./application/use-cases/update-deliverable-section.use-case";

import { DeliverableAccessService } from "./application/services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "./application/services/deliverable-status-recalculation.service";
import { TemplateThemeResolverService } from "./application/services/template-theme-resolver.service";

import { PrismaChecklistPieceEntryRepository } from "./infrastructure/prisma-checklist-piece-entry.repository";
import { PrismaComplianceMatrixEntryRepository } from "./infrastructure/prisma-compliance-matrix-entry.repository";
import { PrismaDeliverableRepository } from "./infrastructure/prisma-deliverable.repository";
import { PrismaDeliverableAnnexRepository } from "./infrastructure/prisma-deliverable-annex.repository";
import { PrismaDeliverableCommentRepository } from "./infrastructure/prisma-deliverable-comment.repository";
import { PrismaDeliverableExportSelectionRepository } from "./infrastructure/prisma-deliverable-export-selection.repository";
import { PrismaDeliverableReviewRepository } from "./infrastructure/prisma-deliverable-review.repository";
import { PrismaDeliverableRevisionRepository } from "./infrastructure/prisma-deliverable-revision.repository";
import { PrismaDeliverableSectionRepository } from "./infrastructure/prisma-deliverable-section.repository";
import { PrismaDeliverableTemplateRepository } from "./infrastructure/prisma-deliverable-template.repository";
import { PrismaDocumentThemeRepository } from "./infrastructure/prisma-document-theme.repository";

import { DeliverablesController } from "./interfaces/http/deliverables.controller";
import { DeliverableSectionsController } from "./interfaces/http/deliverable-sections.controller";
import { DeliverableTemplatesController } from "./interfaces/http/deliverable-templates.controller";
import { DocumentThemesController } from "./interfaces/http/document-themes.controller";

/**
 * Module Deliverables (Sprint 8A.1) — importe `TendersModule`/`ClientPortfolioModule`/
 * `DocumentsModule`/`GenerationModule`/`ExportModule`/`ValidationModule`/`PricingModule`/
 * `SignatureModule`/`SubmissionPackageModule` dans UN SEUL sens (réutilise `LaunchGenerationUseCase`,
 * `PreviewExportUseCase`, `GetReadinessStatusUseCase`/`GetValidationRunUseCase`,
 * `ListPricingEstimatesUseCase`/`GetPricingEstimateUseCase`, `GetDocumentUseCase` (correctif audit
 * Codex P1-003 — vérification d'un `documentId` avant association checklist/annexe),
 * `ListSignatureRequirementsUseCase`/`ListSignatureTransactionsUseCase`,
 * `ListSubmissionPackagesUseCase`) : aucun de ces modules n'importe jamais Deliverables en retour,
 * évitant tout cycle Nest (même motif qu'Export → Generation/Pricing, Sprint 8A). "Ne recode
 * jamais" le moteur IA (Sprint 6), le moteur DOCX/PDF (Sprint 8A), le package/Universign
 * (Sprint 8A bis), les exports administratifs (Sprint 8C).
 */
@Module({
  imports: [
    IdentityModule,
    MembershipsModule,
    TendersModule,
    ClientPortfolioModule,
    DocumentsModule,
    GenerationModule,
    ExportModule,
    ValidationModule,
    PricingModule,
    SignatureModule,
    SubmissionPackageModule,
  ],
  controllers: [DeliverablesController, DeliverableSectionsController, DeliverableTemplatesController, DocumentThemesController],
  providers: [
    // Template/Theme
    CreateDeliverableTemplateUseCase,
    CreateDeliverableTemplateVersionUseCase,
    ActivateDeliverableTemplateVersionUseCase,
    ListDeliverableTemplatesUseCase,
    CreateDocumentThemeUseCase,
    CreateDocumentThemeVersionUseCase,
    ActivateDocumentThemeVersionUseCase,
    ListDocumentThemesUseCase,

    // Deliverable + Section
    EnsureTenderDeliverablesUseCase,
    ListDeliverablesUseCase,
    GetDeliverableUseCase,

    // Génération IA + révisions + édition humaine
    GenerateDeliverableSectionUseCase,
    CreateRevisionFromGenerationUseCase,
    CreateManualRevisionUseCase,
    SaveRevisionDraftUseCase,
    ListSectionRevisionsUseCase,
    CompareRevisionsUseCase,
    SubmitRevisionForReviewUseCase,
    WithdrawRevisionFromReviewUseCase,
    DecideRevisionReviewUseCase,
    RestoreRevisionUseCase,
    UpdateDeliverableSectionUseCase,
    SelectRevisionForExportUseCase,
    PreviewDeliverableUseCase,
    ApproveDeliverableUseCase,

    // Commentaires
    AddDeliverableCommentUseCase,
    ResolveDeliverableCommentUseCase,

    // Autres livrables — overlay léger
    CreateComplianceMatrixEntryUseCase,
    UpdateComplianceMatrixEntryUseCase,
    ValidateComplianceMatrixEntryUseCase,
    ListComplianceMatrixEntriesUseCase,
    CreateChecklistPieceEntryUseCase,
    UpdateChecklistPieceEntryUseCase,
    ListChecklistPieceEntriesUseCase,
    CreateDeliverableAnnexUseCase,
    ListDeliverableAnnexesUseCase,

    // Autres livrables — lecture seule
    GetDeliverableValidationReportUseCase,
    GetDeliverableCostReportUseCase,
    SelectCostReportEstimateUseCase,
    GetDeliverableSignatureDocumentsUseCase,
    GetDeliverableSubmissionPackageUseCase,

    // Services applicatifs
    DeliverableAccessService,
    DeliverableStatusRecalculationService,
    TemplateThemeResolverService,

    // Repositories
    { provide: DELIVERABLE_REPOSITORY, useClass: PrismaDeliverableRepository },
    { provide: DELIVERABLE_SECTION_REPOSITORY, useClass: PrismaDeliverableSectionRepository },
    { provide: DELIVERABLE_REVISION_REPOSITORY, useClass: PrismaDeliverableRevisionRepository },
    { provide: DELIVERABLE_REVIEW_REPOSITORY, useClass: PrismaDeliverableReviewRepository },
    { provide: DELIVERABLE_COMMENT_REPOSITORY, useClass: PrismaDeliverableCommentRepository },
    { provide: DELIVERABLE_EXPORT_SELECTION_REPOSITORY, useClass: PrismaDeliverableExportSelectionRepository },
    { provide: DELIVERABLE_TEMPLATE_REPOSITORY, useClass: PrismaDeliverableTemplateRepository },
    { provide: DOCUMENT_THEME_REPOSITORY, useClass: PrismaDocumentThemeRepository },
    { provide: COMPLIANCE_MATRIX_ENTRY_REPOSITORY, useClass: PrismaComplianceMatrixEntryRepository },
    { provide: CHECKLIST_PIECE_ENTRY_REPOSITORY, useClass: PrismaChecklistPieceEntryRepository },
    { provide: DELIVERABLE_ANNEX_REPOSITORY, useClass: PrismaDeliverableAnnexRepository },
  ],
  // Réexportés pour Sprint 8A.2 (correction bugs #7/#8) — `ExportThemeResolverBridgeModule`
  // (infrastructure/) importe CE module pour lier `TemplateThemeResolverService.resolveTheme` (et
  // `DOCUMENT_THEME_REPOSITORY.findVersionById`, pour un export FINAL qui réutilise le thème déjà
  // figé sur l'aperçu approuvé) au port `THEME_RESOLVER` propre à Export — jamais un second calcul
  // de la hiérarchie de résolution.
  // `ListDeliverablesUseCase` réexporté en plus pour Sprint 8A.2 (module `cockpit`, lecture seule).
  exports: [TemplateThemeResolverService, DOCUMENT_THEME_REPOSITORY, ListDeliverablesUseCase],
})
export class DeliverablesModule {}
