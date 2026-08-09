export type CitationSourceType = "DOCUMENT" | "KNOWLEDGE_ENTRY" | "CHECKLIST_ITEM" | "FINDING" | "TENDER_FIELD";
export type CitationFindingType = "DEADLINE" | "CRITERION" | "REQUIREMENT" | "CLAUSE" | "RISK" | "QUESTION";
export type MessageRole = "USER" | "ASSISTANT";
export type MessageStatus = "PENDING" | "COMPLETED" | "FAILED";

export type Conversation = {
  id: string;
  organizationId: string;
  tenderId: string;
  clientAccountId?: string;
  lotId?: string;
  createdByUserId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type MessageCitation = {
  id: string;
  sourceType: CitationSourceType;
  documentId?: string;
  documentVersionId?: string;
  chunkSequence?: number;
  pageStart?: number;
  pageEnd?: number;
  sheetName?: string;
  sectionTitle?: string;
  knowledgeEntryId?: string;
  knowledgeEntryVersionId?: string;
  checklistItemId?: string;
  findingType?: CitationFindingType;
  findingId?: string;
  label: string;
  excerpt?: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdByUserId?: string;
  model?: string;
  promptVersion?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  totalTokenCount?: number;
  errorMessage?: string;
  createdAt: string;
  citations: MessageCitation[];
};

export const CITATION_SOURCE_LABELS: Record<CitationSourceType, string> = {
  TENDER_FIELD: "Donnée du Tender",
  FINDING: "Analyse IA du DCE",
  CHECKLIST_ITEM: "Checklist",
  DOCUMENT: "Extrait du DCE",
  KNOWLEDGE_ENTRY: "Base de connaissances",
};
