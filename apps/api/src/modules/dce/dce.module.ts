import { Module } from "@nestjs/common";
import { BackgroundTaskRunner } from "../../shared-kernel/background-task-runner";
import { BillingModule } from "../billing";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { ASYNC_JOB_SUBMITTER } from "./application/ports/async-job-submitter";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { DCE_DOCUMENT_REPOSITORY } from "./application/ports/dce-document.repository";
import { DCE_IMPORT_DISPATCHER } from "./application/ports/dce-import-dispatcher";
import { DCE_IMPORT_JOB_REPOSITORY } from "./application/ports/dce-import-job.repository";
import { DCE_REPOSITORY } from "./application/ports/dce.repository";
import { FILE_SIGNATURE_DETECTOR } from "./application/ports/file-signature-detector";
import { ZIP_ARCHIVE_INSPECTOR } from "./application/ports/zip-archive-inspector";

import { CorrectDceDocumentCategoryUseCase } from "./application/use-cases/correct-dce-document-category.use-case";
import { CreateDceUseCase } from "./application/use-cases/create-dce.use-case";
import { DeleteDceDocumentUseCase } from "./application/use-cases/delete-dce-document.use-case";
import { DownloadDceDocumentUseCase } from "./application/use-cases/download-dce-document.use-case";
import { GetDceImportJobUseCase } from "./application/use-cases/get-dce-import-job.use-case";
import { GetDceUseCase } from "./application/use-cases/get-dce.use-case";
import { GetDceDocumentUseCase } from "./application/use-cases/get-dce-document.use-case";
import { ImportDceFilesUseCase } from "./application/use-cases/import-dce-files.use-case";
import { ListDceDocumentsUseCase } from "./application/use-cases/list-dce-documents.use-case";
import { ProcessDceZipImportUseCase } from "./application/use-cases/process-dce-zip-import.use-case";
import { ReplaceDceDocumentUseCase } from "./application/use-cases/replace-dce-document.use-case";
import { StartDceZipImportUseCase } from "./application/use-cases/start-dce-zip-import.use-case";

import { DCE_CONFIG, loadDceConfig } from "./infrastructure/dce-config";
import { InProcessDceImportDispatcher } from "./infrastructure/in-process-dce-import.dispatcher";
import { MagicByteFileSignatureDetector } from "./infrastructure/magic-byte-file-signature.detector";
import { NotWiredAsyncJobSubmitter } from "./infrastructure/not-wired-async-job.submitter";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaDceDocumentRepository } from "./infrastructure/prisma-dce-document.repository";
import { PrismaDceImportJobRepository } from "./infrastructure/prisma-dce-import-job.repository";
import { PrismaDceRepository } from "./infrastructure/prisma-dce.repository";
import { YauzlArchiveInspector } from "./infrastructure/yauzl-archive-inspector";

import { DceController } from "./interfaces/http/dce.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, DocumentsModule, BillingModule],
  controllers: [DceController],
  providers: [
    // Checkpoint TENDEROS-2.1-P2.3-E12.3 — fourni PAR CE MODULE (jamais globalement) :
    // Nest detruit les modules metier AVANT `DatabaseModule`, donc le travail de fond encore en vol
    // est attendu avant la deconnexion Prisma. Voir `BackgroundTaskRunner` pour le contrat complet.
    BackgroundTaskRunner,
    CreateDceUseCase,
    GetDceUseCase,
    ImportDceFilesUseCase,
    StartDceZipImportUseCase,
    ProcessDceZipImportUseCase,
    GetDceImportJobUseCase,
    ListDceDocumentsUseCase,
    GetDceDocumentUseCase,
    DownloadDceDocumentUseCase,
    DeleteDceDocumentUseCase,
    ReplaceDceDocumentUseCase,
    CorrectDceDocumentCategoryUseCase,

    { provide: DCE_REPOSITORY, useClass: PrismaDceRepository },
    { provide: DCE_DOCUMENT_REPOSITORY, useClass: PrismaDceDocumentRepository },
    { provide: DCE_IMPORT_JOB_REPOSITORY, useClass: PrismaDceImportJobRepository },
    { provide: DCE_IMPORT_DISPATCHER, useClass: InProcessDceImportDispatcher },
    { provide: FILE_SIGNATURE_DETECTOR, useClass: MagicByteFileSignatureDetector },
    { provide: ZIP_ARCHIVE_INSPECTOR, useClass: YauzlArchiveInspector },
    { provide: ASYNC_JOB_SUBMITTER, useClass: NotWiredAsyncJobSubmitter },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    // Mission P1-4 — la factory s'exécute une seule fois, à l'instanciation du module (donc au
    // démarrage de l'application) : une configuration absente ou invalide fait échouer
    // NestFactory.create(...) avant même que le serveur n'écoute, jamais au milieu d'une requête.
    { provide: DCE_CONFIG, useFactory: () => loadDceConfig() },
  ],
  // Ports bruts, réexportés uniquement pour un usage système/interne par Extraction (mission
  // Sprint 3 — résolution du DCE d'un Tender et du lien document/DCE pour la chaîne
  // d'autorisation, mise à jour de `processingStatus` en miroir d'une extraction terminée),
  // jamais un contournement du RBAC DCE pour un acteur utilisateur.
  // `GetDceUseCase`/`ListDceDocumentsUseCase` réexportés en plus pour Sprint 8A.2 (module
  // `cockpit`, lecture seule — jamais un second accès direct aux repositories DCE).
  exports: [DCE_REPOSITORY, DCE_DOCUMENT_REPOSITORY, GetDceUseCase, ListDceDocumentsUseCase],
})
export class DceModule {}
