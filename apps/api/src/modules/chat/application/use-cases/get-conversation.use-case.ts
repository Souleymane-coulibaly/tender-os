import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { ConversationNotFoundError } from "../../domain/errors";
import { toConversationSummary, type ConversationSummary } from "../dtos";
import { assertChatAccess } from "../policies/chat-authorization.policy";
import { CONVERSATION_REPOSITORY, type ConversationRepository } from "../ports/conversation.repository";

export type GetConversationQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  conversationId: string;
  actorId: string;
  actorRole: string;
}>;

/** Mission §45 — revérifie le ClientAccess À CHAQUE consultation, jamais un accès hérité de
 *  `createdByUserId === actorId` : une conversation devient invisible même à son auteur si l'accès
 *  client a été révoqué depuis (voir `assertChatAccess`). */
@Injectable()
export class GetConversationUseCase {
  constructor(
    @Inject(CONVERSATION_REPOSITORY) private readonly conversationRepository: ConversationRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetConversationQuery): Promise<ConversationSummary> {
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

    return toConversationSummary(conversation);
  }
}
