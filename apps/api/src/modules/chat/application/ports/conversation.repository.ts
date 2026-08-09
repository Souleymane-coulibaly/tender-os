import type { Conversation } from "../../domain/conversation.entity";

export type ConversationListFilters = Readonly<{
  organizationId: string;
  tenderId: string;
  includeArchived?: boolean | undefined;
}>;

export interface ConversationRepository {
  findById(input: { organizationId: string; conversationId: string }): Promise<Conversation | null>;
  listByTender(filters: ConversationListFilters): Promise<Conversation[]>;
  save(conversation: Conversation): Promise<void>;
}

export const CONVERSATION_REPOSITORY = Symbol("CONVERSATION_REPOSITORY");
