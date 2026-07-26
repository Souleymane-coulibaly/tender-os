export const RequestedDocumentStatus = {
  Pending: "PENDING",
  Provided: "PROVIDED",
  Validated: "VALIDATED",
  Rejected: "REJECTED",
} as const;
export type RequestedDocumentStatus = (typeof RequestedDocumentStatus)[keyof typeof RequestedDocumentStatus];

export type RequestedDocumentProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  name: string;
  category?: string | undefined;
  documentType?: string | undefined;
  required: boolean;
  description?: string | undefined;
  expirationDate?: Date | undefined;
  status: RequestedDocumentStatus;
  documentId?: string | undefined;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RequestedDocumentUpdate = {
  name?: string | undefined;
  category?: string | undefined;
  documentType?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
  expirationDate?: Date | undefined;
  documentId?: string | undefined;
  displayOrder?: number | undefined;
};

/**
 * Référence métier vers une pièce attendue — aucun stockage binaire (module Documents futur).
 */
export class RequestedDocument {
  private constructor(private props: RequestedDocumentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    name: string;
    category?: string | undefined;
    documentType?: string | undefined;
    required?: boolean | undefined;
    description?: string | undefined;
    expirationDate?: Date | undefined;
    displayOrder?: number | undefined;
    occurredAt: Date;
  }): RequestedDocument {
    return new RequestedDocument({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      name: input.name,
      category: input.category,
      documentType: input.documentType,
      required: input.required ?? false,
      description: input.description,
      expirationDate: input.expirationDate,
      status: RequestedDocumentStatus.Pending,
      documentId: undefined,
      displayOrder: input.displayOrder ?? 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: RequestedDocumentProps): RequestedDocument {
    return new RequestedDocument(props);
  }

  update(update: RequestedDocumentUpdate, occurredAt: Date): void {
    if (update.name !== undefined) this.props.name = update.name;
    if (update.category !== undefined) this.props.category = update.category;
    if (update.documentType !== undefined) this.props.documentType = update.documentType;
    if (update.required !== undefined) this.props.required = update.required;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.expirationDate !== undefined) this.props.expirationDate = update.expirationDate;
    if (update.documentId !== undefined) this.props.documentId = update.documentId;
    if (update.displayOrder !== undefined) this.props.displayOrder = update.displayOrder;
    this.props.updatedAt = occurredAt;
  }

  changeStatus(status: RequestedDocumentStatus, occurredAt: Date): void {
    this.props.status = status;
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
  get category(): string | undefined {
    return this.props.category;
  }
  get documentType(): string | undefined {
    return this.props.documentType;
  }
  get required(): boolean {
    return this.props.required;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get expirationDate(): Date | undefined {
    return this.props.expirationDate;
  }
  get status(): RequestedDocumentStatus {
    return this.props.status;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
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
