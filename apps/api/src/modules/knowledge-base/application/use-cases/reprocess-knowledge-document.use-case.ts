import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { KnowledgeDocumentNotFoundError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_DISPATCHER, type KnowledgeDispatcher } from "../ports/knowledge-dispatcher";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY, type KnowledgeEntryVersionRepository } from "../ports/knowledge-entry-version.repository";
import { toKnowledgeDocumentSummary, type KnowledgeDocumentSummary } from "../dtos";

export type ReprocessKnowledgeDocumentCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  knowledgeDocumentId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Mission Sprint 5 §10 "nouvelle extraction" — un des cas explicites de nouvelle version : jamais
 *  un simple retry silencieux, toujours tracé dans l'historique. */
@Injectable()
export class ReprocessKnowledgeDocumentUseCase {
  constructor(
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_ENTRY_VERSION_REPOSITORY) private readonly knowledgeEntryVersionRepository: KnowledgeEntryVersionRepository,
    @Inject(KNOWLEDGE_DISPATCHER) private readonly knowledgeDispatcher: KnowledgeDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ReprocessKnowledgeDocumentCommand): Promise<KnowledgeDocumentSummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Reprocess);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }

    const document = await this.knowledgeDocumentRepository.findById(command);
    if (!document || document.knowledgeEntryId !== command.knowledgeEntryId) {
      throw new KnowledgeDocumentNotFoundError();
    }
    document.assertReprocessable();

    const occurredAt = this.clock.now();
    entry.startDocumentProcessing(occurredAt);
    await this.knowledgeEntryRepository.save(entry);

    await this.knowledgeEntryVersionRepository.create(
      KnowledgeEntryVersion.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: entry.activeVersionNumber,
        reason: "Nouvelle extraction demandée",
        snapshot: { title: entry.title, description: entry.description, category: entry.category, language: entry.language, metadata: entry.metadata, knowledgeDocumentId: document.id },
        createdByUserId: command.actorId,
        occurredAt,
      }),
    );

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "knowledge_document.reprocess_requested",
      resourceType: "knowledge_document",
      resourceId: document.id,
      requestId: command.requestId,
    });

    this.knowledgeDispatcher.dispatch({ organizationId: command.organizationId, knowledgeDocumentId: document.id, requestId: command.requestId });

    return toKnowledgeDocumentSummary(document);
  }
}
