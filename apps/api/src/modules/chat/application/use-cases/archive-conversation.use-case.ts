import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { ConversationNotFoundError } from "../../domain/errors";
import { toConversationSummary, type ConversationSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";

export type ArchiveConversationCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  conversationId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class ArchiveConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ArchiveConversationCommand): Promise<ConversationSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.UseChat);
    await assertChatAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.UseChat,
    });

    const conversation = await this.conversationRepository.findById({ organizationId: command.organizationId, conversationId: command.conversationId });
    if (!conversation || conversation.tenderId !== command.tenderId) {
      throw new ConversationNotFoundError();
    }

    const occurredAt = this.clock.now();
    conversation.archive(occurredAt);
    await this.conversationRepository.save(conversation);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "chat.conversation_archived",
      resourceType: "conversation",
      resourceId: conversation.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toConversationSummary(conversation);
  }
}
