import type { TechnicalMemoCitationSourceType, TechnicalMemoRequirementFindingType } from "./enums";

export type TechnicalMemoSectionCitationProps = {
  id: string;
  organizationId: string;
  technicalMemoSectionRevisionId: string;
  sourceType: TechnicalMemoCitationSourceType;
  findingType?: TechnicalMemoRequirementFindingType | undefined;
  findingId?: string | undefined;
  knowledgeEntryId?: string | undefined;
  knowledgeEntryVersionId?: string | undefined;
  companyReferenceId?: string | undefined;
  candidateFieldPath?: string | undefined;
  documentId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  label: string;
  excerpt?: string | undefined;
  createdAt: Date;
};

/** Immuable — mirroir de `MessageCitation` (Sprint 9) : colonnes typées nullables selon
 *  `sourceType`, jamais un blob JSON. `label` toujours renseigné et lisible (mission §29 "l'utilisateur
 *  doit comprendre pourquoi TenderOS a écrit ceci"), même si le pointeur typé est absent. Une citation
 *  n'est créée qu'après revalidation de la source contre ce que l'appelant a effectivement le droit de
 *  voir — jamais une citation auto-déclarée par le modèle acceptée telle quelle. */
export class TechnicalMemoSectionCitation {
  private constructor(private readonly props: TechnicalMemoSectionCitationProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    technicalMemoSectionRevisionId: string;
    sourceType: TechnicalMemoCitationSourceType;
    findingType?: TechnicalMemoRequirementFindingType | undefined;
    findingId?: string | undefined;
    knowledgeEntryId?: string | undefined;
    knowledgeEntryVersionId?: string | undefined;
    companyReferenceId?: string | undefined;
    candidateFieldPath?: string | undefined;
    documentId?: string | undefined;
    chunkSequence?: number | undefined;
    pageStart?: number | undefined;
    pageEnd?: number | undefined;
    label: string;
    excerpt?: string | undefined;
    occurredAt: Date;
  }): TechnicalMemoSectionCitation {
    return new TechnicalMemoSectionCitation({
      id: input.id,
      organizationId: input.organizationId,
      technicalMemoSectionRevisionId: input.technicalMemoSectionRevisionId,
      sourceType: input.sourceType,
      findingType: input.findingType,
      findingId: input.findingId,
      knowledgeEntryId: input.knowledgeEntryId,
      knowledgeEntryVersionId: input.knowledgeEntryVersionId,
      companyReferenceId: input.companyReferenceId,
      candidateFieldPath: input.candidateFieldPath,
      documentId: input.documentId,
      chunkSequence: input.chunkSequence,
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      label: input.label,
      excerpt: input.excerpt,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: TechnicalMemoSectionCitationProps): TechnicalMemoSectionCitation {
    return new TechnicalMemoSectionCitation(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get technicalMemoSectionRevisionId(): string {
    return this.props.technicalMemoSectionRevisionId;
  }
  get sourceType(): TechnicalMemoCitationSourceType {
    return this.props.sourceType;
  }
  get findingType(): TechnicalMemoRequirementFindingType | undefined {
    return this.props.findingType;
  }
  get findingId(): string | undefined {
    return this.props.findingId;
  }
  get knowledgeEntryId(): string | undefined {
    return this.props.knowledgeEntryId;
  }
  get knowledgeEntryVersionId(): string | undefined {
    return this.props.knowledgeEntryVersionId;
  }
  get companyReferenceId(): string | undefined {
    return this.props.companyReferenceId;
  }
  get candidateFieldPath(): string | undefined {
    return this.props.candidateFieldPath;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
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
