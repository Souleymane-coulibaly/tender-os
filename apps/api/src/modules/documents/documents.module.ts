import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { DOCUMENT_REPOSITORY } from "./application/ports/document.repository";
import { DOCUMENT_TENDER_ASSOCIATION_REPOSITORY } from "./application/ports/document-tender-association.repository";
import { DOCUMENT_VERSION_REPOSITORY } from "./application/ports/document-version.repository";
import { STORAGE_PROVIDER } from "./application/ports/storage-provider";

import { AddDocumentVersionUseCase } from "./application/use-cases/add-document-version.use-case";
import { ArchiveDocumentUseCase } from "./application/use-cases/archive-document.use-case";
import { AttachDocumentToTenderUseCase } from "./application/use-cases/attach-document-to-tender.use-case";
import { CreateDocumentWithFirstVersionUseCase } from "./application/use-cases/create-document-with-first-version.use-case";
import { DeleteDocumentUseCase } from "./application/use-cases/delete-document.use-case";
import { DetachDocumentFromTenderUseCase } from "./application/use-cases/detach-document-from-tender.use-case";
import { DownloadDocumentVersionUseCase } from "./application/use-cases/download-document-version.use-case";
import { GetDocumentUseCase } from "./application/use-cases/get-document.use-case";
import { ListDocumentVersionsUseCase } from "./application/use-cases/list-document-versions.use-case";
import { ListOrganizationDocumentsUseCase } from "./application/use-cases/list-organization-documents.use-case";
import { ListTenderDocumentsUseCase } from "./application/use-cases/list-tender-documents.use-case";
import { RestoreDocumentUseCase } from "./application/use-cases/restore-document.use-case";
import { UpdateDocumentMetadataUseCase } from "./application/use-cases/update-document-metadata.use-case";
import { InternalDocumentCleanupService } from "./application/services/internal-document-cleanup.service";

import { LocalFilesystemStorageProvider } from "./infrastructure/local-filesystem-storage.provider";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaDocumentRepository } from "./infrastructure/prisma-document.repository";
import { PrismaDocumentTenderAssociationRepository } from "./infrastructure/prisma-document-tender-association.repository";
import { PrismaDocumentVersionRepository } from "./infrastructure/prisma-document-version.repository";

import { DocumentsController } from "./interfaces/http/documents.controller";
import { TenderDocumentsController } from "./interfaces/http/tender-documents.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule],
  controllers: [DocumentsController, TenderDocumentsController],
  providers: [
    CreateDocumentWithFirstVersionUseCase,
    AddDocumentVersionUseCase,
    GetDocumentUseCase,
    ListOrganizationDocumentsUseCase,
    ListTenderDocumentsUseCase,
    UpdateDocumentMetadataUseCase,
    ArchiveDocumentUseCase,
    RestoreDocumentUseCase,
    DeleteDocumentUseCase,
    ListDocumentVersionsUseCase,
    DownloadDocumentVersionUseCase,
    AttachDocumentToTenderUseCase,
    DetachDocumentFromTenderUseCase,
    InternalDocumentCleanupService,

    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    { provide: DOCUMENT_VERSION_REPOSITORY, useClass: PrismaDocumentVersionRepository },
    { provide: DOCUMENT_TENDER_ASSOCIATION_REPOSITORY, useClass: PrismaDocumentTenderAssociationRepository },
    { provide: STORAGE_PROVIDER, useClass: LocalFilesystemStorageProvider },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
  // Réexportés pour permettre au module DCE de déléguer ses écritures de fichier (création,
  // ajout de version, suppression, téléchargement, lecture) à Documents plutôt que de dupliquer
  // le stockage/versionnement/checksum — même motif que la réexportation de GetTenderUseCase par
  // Tenders pour Documents.
  exports: [
    CreateDocumentWithFirstVersionUseCase,
    AddDocumentVersionUseCase,
    GetDocumentUseCase,
    DownloadDocumentVersionUseCase,
    DeleteDocumentUseCase,
    // Nettoyage technique interne (mission P1-1 bis) — jamais un endpoint, réexporté uniquement
    // pour que DCE (ImportDceFilesUseCase) puisse compenser une écriture partielle sans dépendre
    // du RBAC utilisateur porté par DeleteDocumentUseCase.
    InternalDocumentCleanupService,
    // Ports bruts, réexportés uniquement pour un usage système interne par Extraction (mission
    // Sprint 3 — résolution du fichier stocké à traiter), jamais par un contournement du RBAC
    // Documents pour un acteur utilisateur.
    DOCUMENT_REPOSITORY,
    DOCUMENT_VERSION_REPOSITORY,
    STORAGE_PROVIDER,
    // Réexporté pour Sprint 8A.2 (module `cockpit`, lecture seule).
    ListTenderDocumentsUseCase,
    // Réexporté pour Sprint 9 (module `submission`) — garantit qu'une preuve de dépôt est
    // structurellement rattachée au Tender de la soumission (correctif audit Codex P1), jamais un
    // second mécanisme d'association.
    AttachDocumentToTenderUseCase,
    // Réexporté en LECTURE SEULE pour Sprint 14 (module `response-package`, correctif audit Codex
    // RP-P1-01) — vérifier qu'un document sélectionné manuellement appartient bien au Tender du
    // dossier de réponse avant de l'y rattacher.
    DOCUMENT_TENDER_ASSOCIATION_REPOSITORY,
  ],
})
export class DocumentsModule {}
