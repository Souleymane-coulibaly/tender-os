import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeTagNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";

export type DeleteKnowledgeTagCommand = Readonly<{ organizationId: string; tagId: string; actorId: string; actorRole: string; requestId?: string | undefined }>;

/** Mission Sprint 5 §4 "suppression sans casser les entrées" — retire le tag ET toutes ses
 *  associations (cascade maîtrisée, voir migration), jamais les entrées elles-mêmes. */
@Injectable()
export class DeleteKnowledgeTagUseCase {
  constructor(
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
  ) {}

  async execute(command: DeleteKnowledgeTagCommand): Promise<void> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.ManageTags);

    const tag = await this.knowledgeTagRepository.findById(command);
    if (!tag) {
      throw new KnowledgeTagNotFoundError();
    }

    await this.knowledgeTagRepository.delete(command);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "knowledge_tag.deleted",
      resourceType: "knowledge_tag",
      resourceId: command.tagId,
      requestId: command.requestId,
    });
  }
}
