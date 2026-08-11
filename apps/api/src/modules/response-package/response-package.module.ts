import { Module } from "@nestjs/common";
import { AdministrativeDossierModule } from "../administrative-dossier";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { PricingScheduleModule } from "../pricing-schedule";
import { TechnicalMemoModule } from "../technical-memo";
import { TendersModule } from "../tenders";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { PACKAGE_ARTIFACT_REPOSITORY } from "./application/ports/package-artifact.repository";
import { PACKAGE_ITEM_REPOSITORY } from "./application/ports/package-item.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY } from "./application/ports/response-package-version.repository";
import { RESPONSE_PACKAGE_REPOSITORY } from "./application/ports/response-package.repository";
import { ZIP_ARCHIVE_PORT } from "./application/ports/zip-archive.port";
import { PackageItemEditGuard } from "./application/services/package-item-edit-guard.service";
import { ResponsePackageAccessService } from "./application/services/response-package-access.service";
import { BuildResponsePackageVersionUseCase } from "./application/use-cases/build-response-package-version.use-case";
import { CorrectPackageItemQualificationUseCase } from "./application/use-cases/correct-package-item-qualification.use-case";
import { CreateResponsePackageUseCase } from "./application/use-cases/create-response-package.use-case";
import { DownloadResponsePackageArtifactUseCase } from "./application/use-cases/download-response-package-artifact.use-case";
import { GenerateResponsePackageZipUseCase } from "./application/use-cases/generate-response-package-zip.use-case";
import { GetPackageCompletenessUseCase } from "./application/use-cases/get-package-completeness.use-case";
import { GetResponsePackageUseCase } from "./application/use-cases/get-response-package.use-case";
import { ListResponsePackagesUseCase } from "./application/use-cases/list-response-packages.use-case";
import { SelectPackageItemDocumentUseCase } from "./application/use-cases/select-package-item-document.use-case";
import { ValidateResponsePackageVersionUseCase } from "./application/use-cases/validate-response-package-version.use-case";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaPackageArtifactRepository } from "./infrastructure/prisma-package-artifact.repository";
import { PrismaPackageItemRepository } from "./infrastructure/prisma-package-item.repository";
import { PrismaResponsePackageVersionRepository } from "./infrastructure/prisma-response-package-version.repository";
import { PrismaResponsePackageRepository } from "./infrastructure/prisma-response-package.repository";
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
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, AdministrativeDossierModule, TechnicalMemoModule, PricingScheduleModule],
  controllers: [TenderResponsePackagesController, ResponsePackagesController, PackageArtifactsController],
  providers: [
    CreateResponsePackageUseCase,
    BuildResponsePackageVersionUseCase,
    GetResponsePackageUseCase,
    ListResponsePackagesUseCase,
    CorrectPackageItemQualificationUseCase,
    SelectPackageItemDocumentUseCase,
    GetPackageCompletenessUseCase,
    ValidateResponsePackageVersionUseCase,
    GenerateResponsePackageZipUseCase,
    DownloadResponsePackageArtifactUseCase,

    ResponsePackageAccessService,
    PackageItemEditGuard,

    { provide: RESPONSE_PACKAGE_REPOSITORY, useClass: PrismaResponsePackageRepository },
    { provide: RESPONSE_PACKAGE_VERSION_REPOSITORY, useClass: PrismaResponsePackageVersionRepository },
    { provide: PACKAGE_ITEM_REPOSITORY, useClass: PrismaPackageItemRepository },
    { provide: PACKAGE_ARTIFACT_REPOSITORY, useClass: PrismaPackageArtifactRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
    { provide: ZIP_ARCHIVE_PORT, useClass: JszipArchiveAdapter },
  ],
  exports: [],
})
export class ResponsePackageModule {}
