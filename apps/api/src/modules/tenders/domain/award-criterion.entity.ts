export type AwardCriterionProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  name: string;
  description?: string | undefined;
  weight: string;
  parentCriterionId?: string | undefined;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AwardCriterionUpdate = {
  name?: string | undefined;
  description?: string | undefined;
  weight?: string | undefined;
  displayOrder?: number | undefined;
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
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
