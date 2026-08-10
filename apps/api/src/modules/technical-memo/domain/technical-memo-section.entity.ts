import { TechnicalMemoSectionCategory, TechnicalMemoSectionStatus } from "./enums";

export type TechnicalMemoSectionProps = {
  id: string;
  organizationId: string;
  technicalMemoId: string;
  parentSectionId?: string | undefined;
  sectionKey: string;
  title: string;
  order: number;
  level: number;
  category: TechnicalMemoSectionCategory;
  categoryConfirmedByUser: boolean;
  instructionText?: string | undefined;
  isTable: boolean;
  wordLimit?: number | undefined;
  pageLimit?: number | undefined;
  status: TechnicalMemoSectionStatus;
  content?: string | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/** Mission §13 — la structure du modèle prévaut : `title`/`order`/`level`/`parentSectionId` sont
 *  fixés à l'analyse et jamais réordonnés/renommés arbitrairement par l'IA ensuite. `content`
 *  reflète TOUJOURS la dernière `TechnicalMemoSectionRevision` — mis à jour uniquement via
 *  `applyRevision`, jamais directement. */
export class TechnicalMemoSection {
  private constructor(private props: TechnicalMemoSectionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    technicalMemoId: string;
    parentSectionId?: string | undefined;
    sectionKey: string;
    title: string;
    order: number;
    level: number;
    category?: TechnicalMemoSectionCategory | undefined;
    instructionText?: string | undefined;
    isTable?: boolean | undefined;
    wordLimit?: number | undefined;
    pageLimit?: number | undefined;
    createdBy: string;
    occurredAt: Date;
  }): TechnicalMemoSection {
    return new TechnicalMemoSection({
      id: input.id,
      organizationId: input.organizationId,
      technicalMemoId: input.technicalMemoId,
      parentSectionId: input.parentSectionId,
      sectionKey: input.sectionKey,
      title: input.title,
      order: input.order,
      level: input.level,
      category: input.category ?? TechnicalMemoSectionCategory.NeedsMapping,
      categoryConfirmedByUser: false,
      instructionText: input.instructionText,
      isTable: input.isTable ?? false,
      wordLimit: input.wordLimit,
      pageLimit: input.pageLimit,
      status: TechnicalMemoSectionStatus.Empty,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TechnicalMemoSectionProps): TechnicalMemoSection {
    return new TechnicalMemoSection(props);
  }

  /** Mission §15 — suggestion IA de catégorie, jamais appliquée comme confirmée sans action
   *  utilisateur explicite (`confirmedByUser`). */
  suggestCategory(input: { category: TechnicalMemoSectionCategory; occurredAt: Date }): void {
    if (this.props.categoryConfirmedByUser) return;
    this.props.category = input.category;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §55 — correction manuelle explicite, toujours prioritaire sur une suggestion IA. */
  confirmCategory(input: { category: TechnicalMemoSectionCategory; occurredAt: Date }): void {
    this.props.category = input.category;
    this.props.categoryConfirmedByUser = true;
    this.props.updatedAt = input.occurredAt;
  }

  markGenerating(occurredAt: Date): void {
    this.props.status = TechnicalMemoSectionStatus.Generating;
    this.props.updatedAt = occurredAt;
  }

  markFailed(occurredAt: Date): void {
    this.props.status = TechnicalMemoSectionStatus.Failed;
    this.props.updatedAt = occurredAt;
  }

  /** Applique le contenu d'une nouvelle révision (mission §39 "content toujours synchronisé avec la
   *  dernière révision"). `hasMissingData` dégrade le statut en NEEDS_REVIEW plutôt que DRAFT —
   *  jamais présenté comme complet quand des informations manquent. */
  applyRevision(input: { content: string; hasMissingData: boolean; occurredAt: Date }): void {
    this.props.content = input.content;
    this.props.status = input.hasMissingData ? TechnicalMemoSectionStatus.NeedsReview : TechnicalMemoSectionStatus.Draft;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §38 — une intervention humaine explicite est requise, jamais une génération qui
   *  passerait directement en VALIDATED. */
  validate(occurredAt: Date): void {
    this.props.status = TechnicalMemoSectionStatus.Validated;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get technicalMemoId(): string {
    return this.props.technicalMemoId;
  }
  get parentSectionId(): string | undefined {
    return this.props.parentSectionId;
  }
  get sectionKey(): string {
    return this.props.sectionKey;
  }
  get title(): string {
    return this.props.title;
  }
  get order(): number {
    return this.props.order;
  }
  get level(): number {
    return this.props.level;
  }
  get category(): TechnicalMemoSectionCategory {
    return this.props.category;
  }
  get categoryConfirmedByUser(): boolean {
    return this.props.categoryConfirmedByUser;
  }
  get instructionText(): string | undefined {
    return this.props.instructionText;
  }
  get isTable(): boolean {
    return this.props.isTable;
  }
  get wordLimit(): number | undefined {
    return this.props.wordLimit;
  }
  get pageLimit(): number | undefined {
    return this.props.pageLimit;
  }
  get status(): TechnicalMemoSectionStatus {
    return this.props.status;
  }
  get content(): string | undefined {
    return this.props.content;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
