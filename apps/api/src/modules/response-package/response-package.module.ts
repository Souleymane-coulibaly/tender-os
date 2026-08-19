import { Module } from "@nestjs/common";
import { AdministrativeDossierModule } from "../administrative-dossier";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";
import { PricingScheduleModule } from "../pricing-schedule";
import { TechnicalMemoModule } from "../technical-memo";
import { TendersModule } from "../tenders";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { PACKAGE_ARTIFACT_REPOSITORY } from "./application/ports/package-artifact.repository";
import { PACKAGE_ITEM_REPOSITORY } from "./application/ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY } from "./application/ports/response-package-version.repository";
import { RESPONSE_PACKAGE_REPOSITORY } from "./application/ports/response-package.repository";
import { TENDER_ACTIVITY_WRITER } from "./application/ports/tender-activity-writer";
import { ZIP_ARCHIVE_PORT } from "./application/ports/zip-archive.port";
import { PackageItemEditGuard } from "./application/services/package-item-edit-guard.service";
import { ResponsePackageAccessService } from "./application/services/response-package-access.service";
import { BuildResponsePackageVersionUseCase } from "./application/use-cases/build-response-package-version.use-case";
import { CorrectPackageItemQualificationUseCase } from "./application/use-cases/correct-package-item-qualification.use-case";
import { CreateResponsePackageUseCase } from "./application/use-cases/create-response-package.use-case";
import { DownloadResponsePackageArtifactUseCase } from "./application/use-cases/download-response-package-artifact.use-case";
import { GenerateResponsePackageZipUseCase } from "./application/use-cases/generate-response-package-zip.use-case";
import { GetPackageCompletenessUseCase } from "./application/use-cases/get-package-completeness.use-case";
import { GetResponsePackageFreshnessUseCase } from "./application/use-cases/get-response-package-freshness.use-case";
import { GetResponsePackageUseCase } from "./application/use-cases/get-response-package.use-case";
import { GetResponsePackagePortfolioSummaryForDashboardUseCase } from "./application/use-cases/get-response-package-portfolio-summary-for-dashboard.use-case";
import { GetResponsePackageForPublicApiUseCase } from "./application/use-cases/get-response-package-for-public-api.use-case";
import { GetVersionTenderRefForApprovalUseCase } from "./application/use-cases/get-version-tender-ref-for-approval.use-case";
import { ListResponsePackagesUseCase } from "./application/use-cases/list-response-packages.use-case";
import { SelectPackageItemDocumentUseCase } from "./application/use-cases/select-package-item-document.use-case";
import { ValidateResponsePackageVersionUseCase } from "./application/use-cases/validate-response-package-version.use-case";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaPackageArtifactRepository } from "./infrastructure/prisma-package-artifact.repository";
import { PrismaPackageItemRepository } from "./infrastructure/prisma-package-item.repository";
import { PrismaResponsePackageVersionRepository } from "./infrastructure/prisma-response-package-version.repository";
import { PrismaResponsePackageRepository } from "./infrastructure/prisma-response-package.repository";
import { PrismaTenderActivityWriter } from "./infrastructure/prisma-tender-activity.writer";
import { JszipArchiveAdapter } from "./infrastructure/zip/jszip-archive.adapter";
import { PackageArtifactsController } from "./interfaces/http/package-artifacts.controller";
import { ResponsePackagesController } from "./interfaces/http/response-packages.controller";
import { TenderResponsePackagesController } from "./interfaces/http/tender-response-packages.controller";

/**
 * V2 Sprint 14 (Finalisation du dossier de réponse / Package final) — décision architecturale
 * validée (AskUserQuestion) : nouveau module ÉTROIT, scopé Tender+Lot+Candidate, jamais un
 * rétrofit de `export`/`deliverables`/`validation`/`signature`/`submission-package`/`submission`
 * (6 modules déjà livrés, strictement Tender-only, jamais lotId). Importe `AdministrativeDossierModule`/
 * `TechnicalMemoModule`/`PricingScheduleModule` UNIQUEMENT pour leurs ports de LECTURE SEULE
 * réexportés (`ListValidatedAdministrativeDocumentsForPackageUseCase`/
 * `GetCandidateContextForPackageUseCase`/`ListValidatedTechnicalMemosForPackageUseCase`/
 * `ListFinalFilesForPackageUseCase`) — jamais un second moteur DOCX/Pricing/Checklist/Documents
 * (mission §2). `TendersModule` fournit `CHECKLIST_ITEM_REPOSITORY` (Sprint 6, source de vérité des
 * pièces attendues, jamais une seconde Checklist). `DocumentsModule` fournit `StorageProvider`/
 * `DOCUMENT_VERSION_REPOSITORY` pour l'assemblage ZIP réel.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, AdministrativeDossierModule, TechnicalMemoModule, PricingScheduleModule, OutboxWriterModule],
  controllers: [TenderResponsePackagesController, ResponsePackagesController, PackageArtifactsController],
  providers: [
    CreateResponsePackageUseCase,
    BuildResponsePackageVersionUseCase,
    GetResponsePackageUseCase,
    GetResponsePackageFreshnessUseCase,
    ListResponsePackagesUseCase,
    CorrectPackageItemQualificationUseCase,
    SelectPackageItemDocumentUseCase,
    GetPackageCompletenessUseCase,
    ValidateResponsePackageVersionUseCase,
    GenerateResponsePackageZipUseCase,
    DownloadResponsePackageArtifactUseCase,
    GetResponsePackagePortfolioSummaryForDashboardUseCase,
    GetResponsePackageForPublicApiUseCase,
    GetVersionTenderRefForApprovalUseCase,

    ResponsePackageAccessService,
    PackageItemEditGuard,

    { provide: RESPONSE_PACKAGE_REPOSITORY, useClass: PrismaResponsePackageRepository },
    { provide: RESPONSE_PACKAGE_VERSION_REPOSITORY, useClass: PrismaResponsePackageVersionRepository },
    { provide: PACKAGE_ITEM_REPOSITORY, useClass: PrismaPackageItemRepository },
    { provide: PACKAGE_ARTIFACT_REPOSITORY, useClass: PrismaPackageArtifactRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: TENDER_ACTIVITY_WRITER, useClass: PrismaTenderActivityWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
    { provide: ZIP_ARCHIVE_PORT, useClass: JszipArchiveAdapter },
  ],
  // V2 Sprint 15/16 — réexportés pour `dashboard`/`integrations` (voir index.ts). V2 Sprint 18 —
  // même motif pour `workspace` (validation d'une cible ApprovalRequest RESPONSE_PACKAGE_VERSION).
  // Checkpoint 2.1-P2.1-FIX-F — `ListResponsePackagesUseCase`/`GetResponsePackageFreshnessUseCase`
  // réexportés en LECTURE SEULE pour `submission` (agrégateur final de readiness), même motif.
  exports: [
    GetResponsePackagePortfolioSummaryForDashboardUseCase,
    GetResponsePackageForPublicApiUseCase,
    GetVersionTenderRefForApprovalUseCase,
    ListResponsePackagesUseCase,
    GetResponsePackageFreshnessUseCase,
  ],
})
export class ResponsePackageModule {}
