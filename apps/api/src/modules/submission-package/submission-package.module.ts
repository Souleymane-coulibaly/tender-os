import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { ExportModule } from "../export";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { SignatureModule } from "../signature";
import { TendersModule } from "../tenders";
import { ValidationModule } from "../validation";
import { SUBMISSION_PACKAGE_REPOSITORY } from "./application/ports/submission-package.repository";
import { ZIP_ARCHIVE_PORT } from "./application/ports/zip-archive.port";
import { PackageAssemblyService } from "./application/services/package-assembly.service";
import { CreateSubmissionPackageUseCase } from "./application/use-cases/create-submission-package.use-case";
import { DownloadSubmissionPackageUseCase } from "./application/use-cases/download-submission-package.use-case";
import { GetSubmissionPackageUseCase } from "./application/use-cases/get-submission-package.use-case";
import { ListSubmissionPackagesUseCase } from "./application/use-cases/list-submission-packages.use-case";
import { JszipArchiveAdapter } from "./infrastructure/jszip-archive.adapter";
import { PrismaSubmissionPackageRepository } from "./infrastructure/prisma-submission-package.repository";
import { SubmissionPackageController } from "./interfaces/http/submission-package.controller";

/**
 * Module SubmissionPackage (Sprint 8A bis) — dernier maillon de la chaîne
 * Export ← {Validation, Signature} ← Package (mission — un package lit les TROIS modules
 * précédents en LECTURE SEULE via leurs use cases/ports réexportés, jamais une seconde écriture
 * sur leurs tables) : aucun de ces modules n'importe jamais Package en retour.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, ExportModule, ValidationModule, SignatureModule, DocumentsModule],
  controllers: [SubmissionPackageController],
  providers: [
    CreateSubmissionPackageUseCase,
    GetSubmissionPackageUseCase,
    ListSubmissionPackagesUseCase,
    DownloadSubmissionPackageUseCase,

    PackageAssemblyService,

    { provide: SUBMISSION_PACKAGE_REPOSITORY, useClass: PrismaSubmissionPackageRepository },
    { provide: ZIP_ARCHIVE_PORT, useClass: JszipArchiveAdapter },
  ],
})
export class SubmissionPackageModule {}
