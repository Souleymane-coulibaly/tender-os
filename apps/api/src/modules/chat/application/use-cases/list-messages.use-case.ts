import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ConversationNotFoundError } from "../../domain/errors";
import { toMessageSummary, type MessageSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";
import { MESSAGE_REPOSITORY, type MessageRepository } from "../ports/message.repository";

export type ListMessagesQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  conversationId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class ListMessagesUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    @Inject(MESSAGE_REPOSITORY) private readonly messageRepository: MessageRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListMessagesQuery): Promise<MessageSummary[]> {
    await assertChatAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadChat,
    });

    const conversation = await this.conversationRepository.findById({ organizationId: query.organizationId, conversationId: query.conversationId });
    if (!conversation || conversation.tenderId !== query.tenderId) {
      throw new ConversationNotFoundError();
    }

    const messages = await this.messageRepository.listByConversation({ organizationId: query.organizationId, conversationId: query.conversationId });
    const citations = await this.messageRepository.listCitationsByMessageIds({ organizationId: query.organizationId, messageIds: messages.map((message) => message.id) });
    const citationsByMessageId = new Map<string, typeof citations>();
    for (const citation of citations) {
      const list = citationsByMessageId.get(citation.messageId) ?? [];
      list.push(citation);
      citationsByMessageId.set(citation.messageId, list);
    }

    return messages.map((message) => toMessageSummary(message, citationsByMessageId.get(message.id) ?? []));
  }
}
