export const AwardCriterionType = {
  Price: "PRICE",
  TechnicalValue: "TECHNICAL_VALUE",
  Delay: "DELAY",
  Environmental: "ENVIRONMENTAL",
  Social: "SOCIAL",
  Other: "OTHER",
} as const;
export type AwardCriterionType = (typeof AwardCriterionType)[keyof typeof AwardCriterionType];

export const AwardCriterionStatus = { Active: "ACTIVE", Archived: "ARCHIVED" } as const;
export type AwardCriterionStatus = (typeof AwardCriterionStatus)[keyof typeof AwardCriterionStatus];

export type AwardCriterionProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  name: string;
  description?: string | undefined;
  weight: string;
  parentCriterionId?: string | undefined;
  displayOrder: number;
  /** Absent = critère au niveau Tender global, renseigné = spécifique à ce lot. */
  lotId?: string | undefined;
  type?: AwardCriterionType | undefined;
  scoringMethod?: string | undefined;
  eliminationThreshold?: string | undefined;
  status: AwardCriterionStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type AwardCriterionUpdate = {
  name?: string | undefined;
  description?: string | undefined;
  weight?: string | undefined;
  displayOrder?: number | undefined;
  lotId?: string | undefined;
  type?: AwardCriterionType | undefined;
  scoringMethod?: string | undefined;
  eliminationThreshold?: string | undefined;
};

/** Pondération en pourcentage — aucune règle de somme totale n'est documentée (non vérifiée). */
export class AwardCriterion {
  private constructor(private props: AwardCriterionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    name: string;
    description?: string | undefined;
    weight: string;
    parentCriterionId?: string | undefined;
    displayOrder?: number | undefined;
    lotId?: string | undefined;
    type?: AwardCriterionType | undefined;
    scoringMethod?: string | undefined;
    eliminationThreshold?: string | undefined;
    occurredAt: Date;
  }): AwardCriterion {
    return new AwardCriterion({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      name: input.name,
      description: input.description,
      weight: input.weight,
      parentCriterionId: input.parentCriterionId,
      displayOrder: input.displayOrder ?? 0,
      lotId: input.lotId,
      type: input.type,
      scoringMethod: input.scoringMethod,
      eliminationThreshold: input.eliminationThreshold,
      status: AwardCriterionStatus.Active,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: AwardCriterionProps): AwardCriterion {
    return new AwardCriterion(props);
  }

  update(update: AwardCriterionUpdate, occurredAt: Date): void {
    if (update.name !== undefined) this.props.name = update.name;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.weight !== undefined) this.props.weight = update.weight;
    if (update.displayOrder !== undefined) this.props.displayOrder = update.displayOrder;
    if (update.lotId !== undefined) this.props.lotId = update.lotId;
    if (update.type !== undefined) this.props.type = update.type;
    if (update.scoringMethod !== undefined) this.props.scoringMethod = update.scoringMethod;
    if (update.eliminationThreshold !== undefined) this.props.eliminationThreshold = update.eliminationThreshold;
    this.props.updatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.props.status = AwardCriterionStatus.Archived;
    this.props.updatedAt = occurredAt;
  }

  restore(occurredAt: Date): void {
    this.props.status = AwardCriterionStatus.Active;
    this.props.updatedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get weight(): string {
    return this.props.weight;
  }
  get parentCriterionId(): string | undefined {
    return this.props.parentCriterionId;
  }
  get displayOrder(): number {
    return this.props.displayOrder;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get type(): AwardCriterionType | undefined {
    return this.props.type;
  }
  get scoringMethod(): string | undefined {
    return this.props.scoringMethod;
  }
  get eliminationThreshold(): string | undefined {
    return this.props.eliminationThreshold;
  }
  get status(): AwardCriterionStatus {
    return this.props.status;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
