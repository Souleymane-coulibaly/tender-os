import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeEntryArchivedError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";

export type RemoveKnowledgeTagCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  tagId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class RemoveKnowledgeTagUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: RemoveKnowledgeTagCommand): Promise<void> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.ManageTags);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    if (entry.status === KnowledgeEntryStatus.Archived) {
      throw new KnowledgeEntryArchivedError();
    }

    await this.knowledgeTagRepository.detachFromEntry(command);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "knowledge_entry.tag_removed",
      resourceType: "knowledge_entry",
      resourceId: entry.id,
      requestId: command.requestId,
      metadata: { tagId: command.tagId },
    });
  }
}
