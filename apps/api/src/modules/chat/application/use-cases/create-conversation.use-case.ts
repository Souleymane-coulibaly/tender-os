import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { assertHasTenderPermission, assertLotBelongsToTender, GetTenderUseCase, TENDER_LOT_REPOSITORY, TenderPermission, type TenderLotRepository } from "../../../tenders";
import { Conversation } from "../../domain/conversation.entity";
import { toConversationSummary, type ConversationSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";

export type CreateConversationCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  lotId?: string | undefined;
  title?: string | undefined;
  requestId?: string | undefined;
}>;

@Injectable()
export class CreateConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateConversationCommand): Promise<ConversationSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.UseChat);
    const tender = await assertChatAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.UseChat,
    });

    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: command.organizationId, tenderId: command.tenderId, lotId: command.lotId });

    const conversation = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const conversation = Conversation.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        clientAccountId: tender.clientAccountId,
        lotId: command.lotId,
        createdByUserId: command.actorId,
        title: command.title,
        occurredAt,
      });
      await this.conversationRepository.save(conversation);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "chat.conversation_created",
        resourceType: "conversation",
        resourceId: conversation.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, lotId: command.lotId },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "ConversationCreated",
            aggregateType: "Conversation",
            aggregateId: conversation.id,
            payload: { tenderId: command.tenderId },
            occurredAt,
          },
        ],
      });

      return conversation;
    });

    return toConversationSummary(conversation);
  }
}
