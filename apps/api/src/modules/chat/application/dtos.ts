import type { Conversation } from "../domain/conversation.entity";
import type { CitationFindingType, CitationSourceType, MessageCitation } from "../domain/message-citation.entity";
import type { Message, MessageRole, MessageStatus } from "../domain/message.entity";

export type ConversationSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId?: string | undefined;
  lotId?: string | undefined;
  createdByUserId: string;
  title?: string | undefined;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | undefined;
};

export function toConversationSummary(conversation: Conversation): ConversationSummary {
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    tenderId: conversation.tenderId,
    clientAccountId: conversation.clientAccountId,
    lotId: conversation.lotId,
    createdByUserId: conversation.createdByUserId,
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    archivedAt: conversation.archivedAt?.toISOString(),
  };
}

export type MessageCitationSummary = {
  id: string;
  sourceType: CitationSourceType;
  documentId?: string | undefined;
  documentVersionId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  knowledgeEntryId?: string | undefined;
  knowledgeEntryVersionId?: string | undefined;
  checklistItemId?: string | undefined;
  findingType?: CitationFindingType | undefined;
  findingId?: string | undefined;
  label: string;
  excerpt?: string | undefined;
};

export function toCitationSummary(citation: MessageCitation): MessageCitationSummary {
  return {
    id: citation.id,
    sourceType: citation.sourceType,
    documentId: citation.documentId,
    documentVersionId: citation.documentVersionId,
    chunkSequence: citation.chunkSequence,
    pageStart: citation.pageStart,
    pageEnd: citation.pageEnd,
    sheetName: citation.sheetName,
    sectionTitle: citation.sectionTitle,
    knowledgeEntryId: citation.knowledgeEntryId,
    knowledgeEntryVersionId: citation.knowledgeEntryVersionId,
    checklistItemId: citation.checklistItemId,
    findingType: citation.findingType,
    findingId: citation.findingId,
    label: citation.label,
    excerpt: citation.excerpt,
  };
}

export type MessageSummary = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdByUserId?: string | undefined;
  model?: string | undefined;
  promptVersion?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  errorMessage?: string | undefined;
  createdAt: string;
  citations: readonly MessageCitationSummary[];
};

export function toMessageSummary(message: Message, citations: readonly MessageCitation[]): MessageSummary {
  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    status: message.status,
    createdByUserId: message.createdByUserId,
    model: message.model,
    promptVersion: message.promptVersion,
    inputTokenCount: message.inputTokenCount,
    outputTokenCount: message.outputTokenCount,
    totalTokenCount: message.totalTokenCount,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt.toISOString(),
    citations: citations.map(toCitationSummary),
  };
}
