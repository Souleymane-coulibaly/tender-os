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
  isEliminatory: boolean;
  /** Absent = pièce au niveau Tender global, renseigné = spécifique à ce lot. */
  lotId?: string | undefined;
  requestedFormat?: string | undefined;
  signatureRequired: boolean;
  buyerProvidedTemplate: boolean;
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
  isEliminatory?: boolean | undefined;
  lotId?: string | undefined;
  requestedFormat?: string | undefined;
  signatureRequired?: boolean | undefined;
  buyerProvidedTemplate?: boolean | undefined;
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
    isEliminatory?: boolean | undefined;
    lotId?: string | undefined;
    requestedFormat?: string | undefined;
    signatureRequired?: boolean | undefined;
    buyerProvidedTemplate?: boolean | undefined;
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
      isEliminatory: input.isEliminatory ?? false,
      lotId: input.lotId,
      requestedFormat: input.requestedFormat,
      signatureRequired: input.signatureRequired ?? false,
      buyerProvidedTemplate: input.buyerProvidedTemplate ?? false,
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
    if (update.isEliminatory !== undefined) this.props.isEliminatory = update.isEliminatory;
    if (update.lotId !== undefined) this.props.lotId = update.lotId;
    if (update.requestedFormat !== undefined) this.props.requestedFormat = update.requestedFormat;
    if (update.signatureRequired !== undefined) this.props.signatureRequired = update.signatureRequired;
    if (update.buyerProvidedTemplate !== undefined) this.props.buyerProvidedTemplate = update.buyerProvidedTemplate;
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
  get isEliminatory(): boolean {
    return this.props.isEliminatory;
  }
  get lotId(): string | undefined {
    return this.props.lotId;
  }
  get requestedFormat(): string | undefined {
    return this.props.requestedFormat;
  }
  get signatureRequired(): boolean {
    return this.props.signatureRequired;
  }
  get buyerProvidedTemplate(): boolean {
    return this.props.buyerProvidedTemplate;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
