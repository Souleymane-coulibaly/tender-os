import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { CompanyProfileModule } from "../company-profile";
import { DocumentGenerationModule } from "../document-generation";
import { DocumentsModule } from "../documents";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxModule } from "../outbox";
import { PricingModule } from "../pricing";
import { SubcontractorsModule } from "../subcontractors";
import { TendersModule } from "../tenders";

import { ADMINISTRATIVE_DOCUMENT_REPOSITORY } from "./application/ports/administrative-document.repository";
import { ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY } from "./application/ports/administrative-document-revision.repository";
import { ADMINISTRATIVE_DOSSIER_REPOSITORY } from "./application/ports/administrative-dossier.repository";
import { ADMINISTRATIVE_REQUIREMENT_REPOSITORY } from "./application/ports/administrative-requirement.repository";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ADMINISTRATIVE_FORM_DRAFT_REPOSITORY } from "./application/ports/administrative-form-draft.repository";
import { BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY } from "./application/ports/buyer-provided-form-template.repository";
import { CONSORTIUM_REPOSITORY } from "./application/ports/consortium.repository";
import { DC1_DECLARATION_REPOSITORY } from "./application/ports/dc1-declaration.repository";
import { DC2_DECLARATION_REPOSITORY, DC2_DECLARATION_VERSION_REPOSITORY } from "./application/ports/dc2-declaration.repository";
import { DUME_DECLARATION_REPOSITORY, DUME_DECLARATION_VERSION_REPOSITORY } from "./application/ports/dume-declaration.repository";
import { ENGAGEMENT_ACT_REPOSITORY } from "./application/ports/engagement-act.repository";
import { OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY } from "./application/ports/official-administrative-template.repository";
import { SIGNING_POWER_REPOSITORY } from "./application/ports/signing-power.repository";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY } from "./application/ports/subcontractor-declaration.repository";

import {
  AttachAdministrativeDocumentRevisionUseCase,
  CreateAdministrativeDocumentUseCase,
  GetAdministrativeDocumentUseCase,
  RejectAdministrativeDocumentUseCase,
  ValidateAdministrativeDocumentUseCase,
} from "./application/use-cases/administrative-document.use-cases";
import {
  RecordAdministrativeDocumentSignatureUseCase,
  RejectAdministrativeDocumentSignatureUseCase,
  SetAdministrativeDocumentSignatureModeUseCase,
} from "./application/use-cases/administrative-document-signature.use-cases";
import {
  CreateAdministrativeRequirementUseCase,
  ListAdministrativeRequirementsUseCase,
  UpdateAdministrativeRequirementUseCase,
} from "./application/use-cases/administrative-requirement.use-cases";
import { EnsureConsortiumUseCase, GetConsortiumUseCase, UpdateConsortiumUseCase } from "./application/use-cases/consortium.use-cases";
import { EnsureDc1DeclarationUseCase, GetDc1DeclarationUseCase, UpdateDc1DeclarationUseCase } from "./application/use-cases/dc1-declaration.use-cases";
import { CreateDc2DeclarationVersionUseCase, EnsureDc2DeclarationUseCase, GetDc2DeclarationUseCase } from "./application/use-cases/dc2-declaration.use-cases";
import { CreateDumeDeclarationVersionUseCase, EnsureDumeDeclarationUseCase, GetDumeDeclarationUseCase } from "./application/use-cases/dume-declaration.use-cases";
import { EnsureEngagementActUseCase, FreezeEngagementActPricingUseCase, GetEngagementActUseCase, UnfreezeEngagementActPricingUseCase, UpdateEngagementActUseCase } from "./application/use-cases/engagement-act.use-cases";
import { EnsureAdministrativeDossierUseCase } from "./application/use-cases/ensure-administrative-dossier.use-case";
import {
  GenerateOfficialFormUseCase,
  PrepareOfficialFormUseCase,
  PreviewOfficialFormUseCase,
  SaveOfficialFormDraftUseCase,
} from "./application/use-cases/administrative-form.use-cases";
import { GenerateDc1DocumentUseCase } from "./application/use-cases/generate-dc1-document.use-case";
import { GenerateDc2DocumentUseCase } from "./application/use-cases/generate-dc2-document.use-case";
import { GenerateDumeDocumentUseCase } from "./application/use-cases/generate-dume-document.use-case";
import { GenerateEngagementActDocumentUseCase } from "./application/use-cases/generate-engagement-act-document.use-case";
import { GenerateSubcontractorDeclarationDocumentUseCase } from "./application/use-cases/generate-subcontractor-declaration-document.use-case";
import { GetAdministrativeChecklistUseCase } from "./application/use-cases/get-administrative-checklist.use-case";
import { GetAdministrativeDocumentTypeCatalogUseCase } from "./application/use-cases/get-administrative-document-type-catalog.use-case";
import { GetAdministrativeDossierUseCase } from "./application/use-cases/get-administrative-dossier.use-case";
import { GetAdministrativeDossierCapabilitiesUseCase } from "./application/use-cases/get-administrative-dossier-capabilities.use-case";
import { GetDumeXmlDraftUseCase } from "./application/use-cases/get-dume-xml-draft.use-case";
import { ListValidatedAdministrativeDocumentsForPackageUseCase } from "./application/use-cases/list-validated-administrative-documents-for-package.use-case";
import { CreateSigningPowerUseCase, ListSigningPowersUseCase, UpdateSigningPowerUseCase, VerifySigningPowerUseCase } from "./application/use-cases/signing-power.use-cases";
import { CreateSubcontractorDeclarationUseCase, ListSubcontractorDeclarationsUseCase, UpdateSubcontractorDeclarationUseCase } from "./application/use-cases/subcontractor-declaration.use-cases";
import {
  GenerateDc1FormFillUseCase,
  GenerateDc4FormFillUseCase,
  GetDc1FormFillReadinessUseCase,
  GetDc4FormFillReadinessUseCase,
} from "./application/use-cases/official-form-fill.use-cases";

import { AdministrativeDossierAccessService } from "./application/services/administrative-dossier-access.service";
import { AdministrativeDossierRecalculationService } from "./application/services/administrative-dossier-recalculation.service";
import { AdministrativeFormDataAssembler } from "./application/services/administrative-form-data-assembler.service";
import { AdministrativeGeneratedDocumentService } from "./application/services/administrative-generated-document.service";
import { Dc1OfficialFormResolver } from "./application/services/official-form-mappers/dc1-official-form-resolver.service";
import { Dc4OfficialFormResolver } from "./application/services/official-form-mappers/dc4-official-form-resolver.service";

import { PrismaAdministrativeDocumentRepository } from "./infrastructure/prisma-administrative-document.repository";
import { PrismaAdministrativeDocumentRevisionRepository } from "./infrastructure/prisma-administrative-document-revision.repository";
import { PrismaAdministrativeDossierRepository } from "./infrastructure/prisma-administrative-dossier.repository";
import { PrismaAdministrativeFormDraftRepository } from "./infrastructure/prisma-administrative-form-draft.repository";
import { PrismaAdministrativeRequirementRepository } from "./infrastructure/prisma-administrative-requirement.repository";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaBuyerProvidedFormTemplateRepository } from "./infrastructure/prisma-buyer-provided-form-template.repository";
import { PrismaConsortiumRepository } from "./infrastructure/prisma-consortium.repository";
import { PrismaDc1DeclarationRepository } from "./infrastructure/prisma-dc1-declaration.repository";
import { PrismaDc2DeclarationRepository, PrismaDc2DeclarationVersionRepository } from "./infrastructure/prisma-dc2-declaration.repository";
import { PrismaDumeDeclarationRepository, PrismaDumeDeclarationVersionRepository } from "./infrastructure/prisma-dume-declaration.repository";
import { PrismaEngagementActRepository } from "./infrastructure/prisma-engagement-act.repository";
import { PrismaOfficialAdministrativeTemplateRepository } from "./infrastructure/prisma-official-administrative-template.repository";
import { PrismaSigningPowerRepository } from "./infrastructure/prisma-signing-power.repository";
import { PrismaSubcontractorDeclarationRepository } from "./infrastructure/prisma-subcontractor-declaration.repository";

import { AdministrativeDossierController } from "./interfaces/http/administrative-dossier.controller";
import { AdministrativeDossierFormFillController } from "./interfaces/http/administrative-dossier-form-fill.controller";
import { AdministrativeDossierStructuredController } from "./interfaces/http/administrative-dossier-structured.controller";

/**
 * Sprint 8C Phase 1/2 — module `administrative-dossier` : importe `TendersModule`/
 * `ClientPortfolioModule`/`DocumentsModule`/`PricingModule` dans UN SEUL sens (même motif que
 * `DeliverablesModule`) — aucun de ces modules n'importe jamais `administrative-dossier` en retour,
 * évitant tout cycle NestJS. `PricingModule` (Phase 2) est nécessaire à
 * `FreezeEngagementActPricingUseCase` — jamais une seconde lecture directe de la table Pricing.
 * N'exporte rien pour l'instant : aucun autre module ne consomme encore ce bounded context
 * (l'intégration Cockpit/Package viendra dans une phase ultérieure et ajoutera les réexports
 * nécessaires à ce moment-là, pas avant).
 * `ListValidatedAdministrativeDocumentsForPackageUseCase` EST exporté (Phase 2) pour `submission-package`
 * — même motif que `ListDeliverablesUseCase` réexporté pour `cockpit`, jamais une seconde écriture.
 * `ExportModule` (Phase 3) est nécessaire à la génération PDF des pièces structurées — réutilise
 * DIRECTEMENT `PdfRendererPort`/`PDF_RENDERER`, jamais un second moteur PDF.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, PricingModule, ExportModule, CompanyProfileModule, SubcontractorsModule, DocumentGenerationModule, OutboxModule],
  controllers: [AdministrativeDossierController, AdministrativeDossierStructuredController, AdministrativeDossierFormFillController],
  providers: [
    EnsureAdministrativeDossierUseCase,
    GetAdministrativeDossierUseCase,
    GetAdministrativeDossierCapabilitiesUseCase,
    CreateAdministrativeRequirementUseCase,
    UpdateAdministrativeRequirementUseCase,
    ListAdministrativeRequirementsUseCase,
    GetAdministrativeChecklistUseCase,
    GetAdministrativeDocumentTypeCatalogUseCase,
    CreateAdministrativeDocumentUseCase,
    GetAdministrativeDocumentUseCase,
    AttachAdministrativeDocumentRevisionUseCase,
    ValidateAdministrativeDocumentUseCase,
    RejectAdministrativeDocumentUseCase,
    SetAdministrativeDocumentSignatureModeUseCase,
    RecordAdministrativeDocumentSignatureUseCase,
    RejectAdministrativeDocumentSignatureUseCase,

    EnsureConsortiumUseCase,
    GetConsortiumUseCase,
    UpdateConsortiumUseCase,

    EnsureDc1DeclarationUseCase,
    GetDc1DeclarationUseCase,
    UpdateDc1DeclarationUseCase,

    EnsureDc2DeclarationUseCase,
    GetDc2DeclarationUseCase,
    CreateDc2DeclarationVersionUseCase,

    EnsureDumeDeclarationUseCase,
    GetDumeDeclarationUseCase,
    CreateDumeDeclarationVersionUseCase,

    CreateSubcontractorDeclarationUseCase,
    UpdateSubcontractorDeclarationUseCase,
    ListSubcontractorDeclarationsUseCase,

    EnsureEngagementActUseCase,
    GetEngagementActUseCase,
    UpdateEngagementActUseCase,
    FreezeEngagementActPricingUseCase,
    UnfreezeEngagementActPricingUseCase,

    CreateSigningPowerUseCase,
    UpdateSigningPowerUseCase,
    VerifySigningPowerUseCase,
    ListSigningPowersUseCase,

    ListValidatedAdministrativeDocumentsForPackageUseCase,

    GenerateDc1DocumentUseCase,
    GenerateDc2DocumentUseCase,
    GenerateDumeDocumentUseCase,
    GetDumeXmlDraftUseCase,
    GenerateSubcontractorDeclarationDocumentUseCase,
    GenerateEngagementActDocumentUseCase,

    PrepareOfficialFormUseCase,
    SaveOfficialFormDraftUseCase,
    PreviewOfficialFormUseCase,
    GenerateOfficialFormUseCase,

    AdministrativeDossierAccessService,
    AdministrativeDossierRecalculationService,
    AdministrativeFormDataAssembler,
    AdministrativeGeneratedDocumentService,

    Dc1OfficialFormResolver,
    Dc4OfficialFormResolver,
    GetDc1FormFillReadinessUseCase,
    GenerateDc1FormFillUseCase,
    GetDc4FormFillReadinessUseCase,
    GenerateDc4FormFillUseCase,

    { provide: ADMINISTRATIVE_DOSSIER_REPOSITORY, useClass: PrismaAdministrativeDossierRepository },
    { provide: ADMINISTRATIVE_REQUIREMENT_REPOSITORY, useClass: PrismaAdministrativeRequirementRepository },
    { provide: ADMINISTRATIVE_DOCUMENT_REPOSITORY, useClass: PrismaAdministrativeDocumentRepository },
    { provide: ADMINISTRATIVE_DOCUMENT_REVISION_REPOSITORY, useClass: PrismaAdministrativeDocumentRevisionRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: CONSORTIUM_REPOSITORY, useClass: PrismaConsortiumRepository },
    { provide: DC1_DECLARATION_REPOSITORY, useClass: PrismaDc1DeclarationRepository },
    { provide: DC2_DECLARATION_REPOSITORY, useClass: PrismaDc2DeclarationRepository },
    { provide: DC2_DECLARATION_VERSION_REPOSITORY, useClass: PrismaDc2DeclarationVersionRepository },
    { provide: DUME_DECLARATION_REPOSITORY, useClass: PrismaDumeDeclarationRepository },
    { provide: DUME_DECLARATION_VERSION_REPOSITORY, useClass: PrismaDumeDeclarationVersionRepository },
    { provide: SUBCONTRACTOR_DECLARATION_REPOSITORY, useClass: PrismaSubcontractorDeclarationRepository },
    { provide: ENGAGEMENT_ACT_REPOSITORY, useClass: PrismaEngagementActRepository },
    { provide: SIGNING_POWER_REPOSITORY, useClass: PrismaSigningPowerRepository },
    { provide: OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY, useClass: PrismaOfficialAdministrativeTemplateRepository },
    { provide: ADMINISTRATIVE_FORM_DRAFT_REPOSITORY, useClass: PrismaAdministrativeFormDraftRepository },
    { provide: BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY, useClass: PrismaBuyerProvidedFormTemplateRepository },
  ],
  exports: [ListValidatedAdministrativeDocumentsForPackageUseCase],
})
export class AdministrativeDossierModule {}
