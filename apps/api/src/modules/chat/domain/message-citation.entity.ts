/** Hiérarchie des sources (mission §18) — dans l'ordre de préférence du prompt : donnée structurée
 *  Tender > Finding validé > pièce de checklist > extrait DCE > entrée Knowledge Base validée. */
export const CitationSourceType = {
  TenderField: "TENDER_FIELD",
  Finding: "FINDING",
  ChecklistItem: "CHECKLIST_ITEM",
  Document: "DOCUMENT",
  KnowledgeEntry: "KNOWLEDGE_ENTRY",
} as const;
export type CitationSourceType = (typeof CitationSourceType)[keyof typeof CitationSourceType];

/** Miroir des 6 tables de Finding structurés (Sprint 4) — gouverné ici car `MessageCitation` est le
 *  premier endroit du repo à devoir désigner un TYPE de finding par une simple chaîne (les tables
 *  Finding elles-mêmes n'ont pas de discriminant partagé, une par table). */
export const CitationFindingType = {
  Deadline: "DEADLINE",
  Criterion: "CRITERION",
  Requirement: "REQUIREMENT",
  Clause: "CLAUSE",
  Risk: "RISK",
  Question: "QUESTION",
} as const;
export type CitationFindingType = (typeof CitationFindingType)[keyof typeof CitationFindingType];

export type MessageCitationProps = {
  id: string;
  organizationId: string;
  messageId: string;
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
  createdAt: Date;
};

/** Toujours résolue par `chat-citation-validator.ts` CONTRE le contexte réellement fourni au
 *  prompt (mission §"jamais une citation forgée par le LLM acceptée telle quelle") — jamais créée
 *  directement à partir de la sortie brute du modèle. Immuable une fois créée, même motif que
 *  `Mention` (module Workspace). */
export class MessageCitation {
  private constructor(private props: MessageCitationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    messageId: string;
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
    occurredAt: Date;
  }): MessageCitation {
    return new MessageCitation({ ...input, createdAt: input.occurredAt });
  }

  static rehydrate(props: MessageCitationProps): MessageCitation {
    return new MessageCitation(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get messageId(): string {
    return this.props.messageId;
  }
  get sourceType(): CitationSourceType {
    return this.props.sourceType;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get chunkSequence(): number | undefined {
    return this.props.chunkSequence;
  }
  get pageStart(): number | undefined {
    return this.props.pageStart;
  }
  get pageEnd(): number | undefined {
    return this.props.pageEnd;
  }
  get sheetName(): string | undefined {
    return this.props.sheetName;
  }
  get sectionTitle(): string | undefined {
    return this.props.sectionTitle;
  }
  get knowledgeEntryId(): string | undefined {
    return this.props.knowledgeEntryId;
  }
  get knowledgeEntryVersionId(): string | undefined {
    return this.props.knowledgeEntryVersionId;
  }
  get checklistItemId(): string | undefined {
    return this.props.checklistItemId;
  }
  get findingType(): CitationFindingType | undefined {
    return this.props.findingType;
  }
  get findingId(): string | undefined {
    return this.props.findingId;
  }
  get label(): string {
    return this.props.label;
  }
  get excerpt(): string | undefined {
    return this.props.excerpt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
