import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { toConversationSummary, type ConversationSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";

export type ListConversationsQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  includeArchived?: boolean | undefined;
}>;

@Injectable()
export class ListConversationsUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListConversationsQuery): Promise<ConversationSummary[]> {
    await assertChatAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadChat,
    });

    const conversations = await this.conversationRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      includeArchived: query.includeArchived,
    });
    return conversations.map(toConversationSummary);
  }
}
