import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxWriterModule } from "../outbox";
import { TendersModule } from "../tenders";
import { ActivateDocumentTemplateVersionUseCase } from "./application/use-cases/activate-document-template-version.use-case";
import { CreateDocumentTemplateUseCase } from "./application/use-cases/create-document-template.use-case";
import { CreateDocumentTemplateVersionUseCase } from "./application/use-cases/create-document-template-version.use-case";
import { DownloadGeneratedDocumentRevisionUseCase } from "./application/use-cases/download-generated-document-revision.use-case";
import { GenerateDocumentUseCase } from "./application/use-cases/generate-document.use-case";
import { GetDocumentTemplateUseCase } from "./application/use-cases/get-document-template.use-case";
import { GetGeneratedDocumentUseCase } from "./application/use-cases/get-generated-document.use-case";
import { ListDocumentTemplatesUseCase } from "./application/use-cases/list-document-templates.use-case";
import { ListGeneratedDocumentsUseCase } from "./application/use-cases/list-generated-documents.use-case";
import { RegenerateDocumentUseCase } from "./application/use-cases/regenerate-document.use-case";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { DOCX_MERGE_ENGINE } from "./application/ports/docx-merge-engine";
import { DOCUMENT_TEMPLATE_REPOSITORY } from "./application/ports/document-template.repository";
import { GENERATED_DOCUMENT_REPOSITORY } from "./application/ports/generated-document.repository";
import { TEMPLATE_UPLOAD_VALIDATOR } from "./application/ports/template-upload-validator";
import { DocumentGenerationExecutionService } from "./application/services/document-generation-execution.service";
import { DocxtemplaterMergeEngine } from "./infrastructure/docxtemplater-merge-engine";
import { JszipTemplateUploadValidator } from "./infrastructure/jszip-template-upload-validator";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaDocumentTemplateRepository } from "./infrastructure/prisma-document-template.repository";
import { PrismaGeneratedDocumentRepository } from "./infrastructure/prisma-generated-document.repository";
import { DocumentTemplatesController } from "./interfaces/http/document-templates.controller";
import { GeneratedDocumentsController } from "./interfaces/http/generated-documents.controller";
import { TenderDocumentGenerationController } from "./interfaces/http/tender-document-generation.controller";

/**
 * Module Moteur documentaire V2 (Sprint 10) — importe `DocumentsModule` (réutilise Document/
 * DocumentVersion/StorageProvider/`CreateDocumentWithFirstVersionUseCase` tel quel, AUCUN second
 * stockage), `TendersModule`/`ClientPortfolioModule` (même motif dual-tier que Chat/Export/
 * Deliverables), `OutboxWriterModule`. Aucun de ces modules n'importe jamais document-generation en
 * retour. Volontairement SANS dépendance vers `export`/`administrative-dossier` : ce module ne
 * généralise ni ne remplace leur moteur de composition depuis IR (mission — décision validée
 * "nouveau module dédié, technique différente : remplissage d'un fichier .docx réel uploadé, jamais
 * une composition depuis notre propre structure de données").
 *
 * V2 Sprint 11 — `exports` ajouté : `DocumentGenerationExecutionService` et les deux ports
 * repository sont désormais accessibles à un appelant interne contrôlé (`administrative-dossier`,
 * décision Sprint 10 "réservé à un futur appelant interne qui résout une provenance réelle côté
 * serveur avant d'appeler directement, jamais via HTTP"). Les use cases HTTP publics
 * (`GenerateDocumentUseCase`/...) restent, eux, volontairement NON exportés — le flux
 * administratif ne doit jamais transiter par le chemin qui accepte un `data` fourni par le client.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, ClientPortfolioModule, DocumentsModule, OutboxWriterModule],
  controllers: [DocumentTemplatesController, TenderDocumentGenerationController, GeneratedDocumentsController],
  providers: [
    CreateDocumentTemplateUseCase,
    CreateDocumentTemplateVersionUseCase,
    ActivateDocumentTemplateVersionUseCase,
    ListDocumentTemplatesUseCase,
    GetDocumentTemplateUseCase,
    GenerateDocumentUseCase,
    RegenerateDocumentUseCase,
    ListGeneratedDocumentsUseCase,
    GetGeneratedDocumentUseCase,
    DownloadGeneratedDocumentRevisionUseCase,

    DocumentGenerationExecutionService,

    { provide: DOCUMENT_TEMPLATE_REPOSITORY, useClass: PrismaDocumentTemplateRepository },
    { provide: GENERATED_DOCUMENT_REPOSITORY, useClass: PrismaGeneratedDocumentRepository },
    { provide: DOCX_MERGE_ENGINE, useClass: DocxtemplaterMergeEngine },
    { provide: TEMPLATE_UPLOAD_VALIDATOR, useClass: JszipTemplateUploadValidator },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
  exports: [DocumentGenerationExecutionService, DOCUMENT_TEMPLATE_REPOSITORY, GENERATED_DOCUMENT_REPOSITORY, ATOMIC_TRANSACTION_RUNNER],
})
export class DocumentGenerationModule {}
