export type TenderLotProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

export type TenderLotUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
};

export class TenderLot {
  private constructor(private props: TenderLotProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    lotNumber: string;
    title: string;
    description?: string | undefined;
    estimatedAmount?: string | undefined;
    currency?: string | undefined;
    occurredAt: Date;
  }): TenderLot {
    return new TenderLot({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      lotNumber: input.lotNumber,
      title: input.title,
      description: input.description,
      estimatedAmount: input.estimatedAmount,
      currency: input.currency,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TenderLotProps): TenderLot {
    return new TenderLot(props);
  }

  update(update: TenderLotUpdate, occurredAt: Date): void {
    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.estimatedAmount !== undefined) this.props.estimatedAmount = update.estimatedAmount;
    if (update.currency !== undefined) this.props.currency = update.currency;
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

  get lotNumber(): string {
    return this.props.lotNumber;
  }

  get title(): string {
    return this.props.title;
  }

  get description(): string | undefined {
    return this.props.description;
  }

  get estimatedAmount(): string | undefined {
    return this.props.estimatedAmount;
  }

  get currency(): string | undefined {
    return this.props.currency;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
