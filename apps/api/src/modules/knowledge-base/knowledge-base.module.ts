import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { ExtractionModule } from "../extraction";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { KNOWLEDGE_CHUNK_REPOSITORY } from "./application/ports/knowledge-chunk.repository";
import { KNOWLEDGE_DISPATCHER } from "./application/ports/knowledge-dispatcher";
import { KNOWLEDGE_DOCUMENT_REPOSITORY } from "./application/ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY } from "./application/ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY } from "./application/ports/knowledge-entry-version.repository";
import { KNOWLEDGE_SEARCH_PROVIDER } from "./application/ports/knowledge-search-provider";
import { KNOWLEDGE_SPACE_REPOSITORY } from "./application/ports/knowledge-space.repository";
import { KNOWLEDGE_TAG_REPOSITORY } from "./application/ports/knowledge-tag.repository";

import { AddKnowledgeDocumentUseCase } from "./application/use-cases/add-knowledge-document.use-case";
import { AddKnowledgeTagUseCase } from "./application/use-cases/add-knowledge-tag.use-case";
import { ArchiveKnowledgeEntryUseCase } from "./application/use-cases/archive-knowledge-entry.use-case";
import { CreateKnowledgeEntryUseCase } from "./application/use-cases/create-knowledge-entry.use-case";
import { DeleteKnowledgeEntryUseCase } from "./application/use-cases/delete-knowledge-entry.use-case";
import { DeleteKnowledgeTagUseCase } from "./application/use-cases/delete-knowledge-tag.use-case";
import { GetKnowledgeDocumentUseCase } from "./application/use-cases/get-knowledge-document.use-case";
import { GetKnowledgeEntryUseCase } from "./application/use-cases/get-knowledge-entry.use-case";
import { GetKnowledgeVersionUseCase } from "./application/use-cases/get-knowledge-version.use-case";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./application/use-cases/get-or-create-default-knowledge-space.use-case";
import { ListKnowledgeDocumentsUseCase } from "./application/use-cases/list-knowledge-documents.use-case";
import { ListKnowledgeEntriesUseCase } from "./application/use-cases/list-knowledge-entries.use-case";
import { ListKnowledgeTagsUseCase } from "./application/use-cases/list-knowledge-tags.use-case";
import { ListKnowledgeVersionsUseCase } from "./application/use-cases/list-knowledge-versions.use-case";
import { ProcessKnowledgeDocumentUseCase } from "./application/use-cases/process-knowledge-document.use-case";
import { RemoveKnowledgeTagUseCase } from "./application/use-cases/remove-knowledge-tag.use-case";
import { ReprocessKnowledgeDocumentUseCase } from "./application/use-cases/reprocess-knowledge-document.use-case";
import { RestoreKnowledgeEntryUseCase } from "./application/use-cases/restore-knowledge-entry.use-case";
import { RestoreKnowledgeVersionUseCase } from "./application/use-cases/restore-knowledge-version.use-case";
import { SearchKnowledgeBaseUseCase } from "./application/use-cases/search-knowledge-base.use-case";
import { UpdateKnowledgeEntryUseCase } from "./application/use-cases/update-knowledge-entry.use-case";

import { InProcessKnowledgeDispatcher } from "./infrastructure/in-process-knowledge.dispatcher";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaIlikeKnowledgeSearchProvider } from "./infrastructure/prisma-ilike-knowledge-search.provider";
import { PrismaKnowledgeChunkRepository } from "./infrastructure/prisma-knowledge-chunk.repository";
import { PrismaKnowledgeDocumentRepository } from "./infrastructure/prisma-knowledge-document.repository";
import { PrismaKnowledgeEntryRepository } from "./infrastructure/prisma-knowledge-entry.repository";
import { PrismaKnowledgeEntryVersionRepository } from "./infrastructure/prisma-knowledge-entry-version.repository";
import { PrismaKnowledgeSpaceRepository } from "./infrastructure/prisma-knowledge-space.repository";
import { PrismaKnowledgeTagRepository } from "./infrastructure/prisma-knowledge-tag.repository";

import { KnowledgeController } from "./interfaces/http/knowledge.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, DocumentsModule, ExtractionModule, ClientPortfolioModule],
  controllers: [KnowledgeController],
  providers: [
    GetOrCreateDefaultKnowledgeSpaceUseCase,
    CreateKnowledgeEntryUseCase,
    GetKnowledgeEntryUseCase,
    ListKnowledgeEntriesUseCase,
    UpdateKnowledgeEntryUseCase,
    ArchiveKnowledgeEntryUseCase,
    RestoreKnowledgeEntryUseCase,
    DeleteKnowledgeEntryUseCase,
    AddKnowledgeDocumentUseCase,
    ListKnowledgeDocumentsUseCase,
    GetKnowledgeDocumentUseCase,
    ReprocessKnowledgeDocumentUseCase,
    ProcessKnowledgeDocumentUseCase,
    SearchKnowledgeBaseUseCase,
    ListKnowledgeVersionsUseCase,
    GetKnowledgeVersionUseCase,
    RestoreKnowledgeVersionUseCase,
    ListKnowledgeTagsUseCase,
    AddKnowledgeTagUseCase,
    RemoveKnowledgeTagUseCase,
    DeleteKnowledgeTagUseCase,

    { provide: KNOWLEDGE_SPACE_REPOSITORY, useClass: PrismaKnowledgeSpaceRepository },
    { provide: KNOWLEDGE_ENTRY_REPOSITORY, useClass: PrismaKnowledgeEntryRepository },
    { provide: KNOWLEDGE_ENTRY_VERSION_REPOSITORY, useClass: PrismaKnowledgeEntryVersionRepository },
    { provide: KNOWLEDGE_DOCUMENT_REPOSITORY, useClass: PrismaKnowledgeDocumentRepository },
    { provide: KNOWLEDGE_CHUNK_REPOSITORY, useClass: PrismaKnowledgeChunkRepository },
    { provide: KNOWLEDGE_TAG_REPOSITORY, useClass: PrismaKnowledgeTagRepository },
    { provide: KNOWLEDGE_SEARCH_PROVIDER, useClass: PrismaIlikeKnowledgeSearchProvider },
    { provide: KNOWLEDGE_DISPATCHER, useClass: InProcessKnowledgeDispatcher },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
  ],
})
export class KnowledgeBaseModule {}
