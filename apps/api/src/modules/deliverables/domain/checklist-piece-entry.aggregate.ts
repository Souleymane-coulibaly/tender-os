import { ChecklistPieceStatus } from "./checklist-piece-status";

export type ChecklistPieceEntryProps = {
  id: string;
  organizationId: string;
  deliverableId: string;
  name: string;
  source?: string | undefined;
  mandatory: boolean;
  format?: string | undefined;
  documentId?: string | undefined;
  version?: string | undefined;
  /** Correctif audit Codex P1-003 — référence de version IMMUABLE dérivée du document VÉRIFIÉ
   *  (jamais fournie par le client), dénormalisée en LECTURE SEULE (jamais de FK inter-module, même
   *  motif que `pricingEstimateId` sur `ExportSectionSelection`). */
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  expiresAt?: Date | undefined;
  signatureRequired: boolean;
  status: ChecklistPieceStatus;
  responsibleUserId?: string | undefined;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const MAX_NAME_LENGTH = 300;

/** Mission §14 — checklist des pièces à fournir : overlay léger, chaque pièce éditée directement. */
export class ChecklistPieceEntry {
  private constructor(private props: ChecklistPieceEntryProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableId: string;
    name: string;
    source?: string | undefined;
    mandatory: boolean;
    format?: string | undefined;
    signatureRequired?: boolean | undefined;
    order: number;
    createdBy: string;
    occurredAt: Date;
  }): ChecklistPieceEntry {
    const name = input.name.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new Error(`name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }
    return new ChecklistPieceEntry({
      id: input.id,
      organizationId: input.organizationId,
      deliverableId: input.deliverableId,
      name,
      source: input.source,
      mandatory: input.mandatory,
      format: input.format,
      signatureRequired: input.signatureRequired ?? false,
      status: ChecklistPieceStatus.Missing,
      order: input.order,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: ChecklistPieceEntryProps): ChecklistPieceEntry {
    return new ChecklistPieceEntry(props);
  }

  /** Correctif audit Codex P1-003 — `documentVersionId`/`documentChecksum`/`documentFileName`/
   *  `documentMimeType` sont TOUJOURS dérivés d'un document déjà vérifié par l'appelant (jamais des
   *  valeurs fournies directement par le client) — voir `UpdateChecklistPieceEntryUseCase`. */
  attachDocument(input: {
    documentId: string;
    version?: string | undefined;
    documentVersionId: string;
    documentChecksum: string;
    documentFileName: string;
    documentMimeType: string;
    expiresAt?: Date | undefined;
    occurredAt: Date;
  }): void {
    this.props.documentId = input.documentId;
    this.props.version = input.version;
    this.props.documentVersionId = input.documentVersionId;
    this.props.documentChecksum = input.documentChecksum;
    this.props.documentFileName = input.documentFileName;
    this.props.documentMimeType = input.documentMimeType;
    this.props.expiresAt = input.expiresAt;
    this.props.status = ChecklistPieceStatus.Provided;
    this.props.updatedAt = input.occurredAt;
  }

  changeStatus(input: { status: ChecklistPieceStatus; occurredAt: Date }): void {
    this.props.status = input.status;
    this.props.updatedAt = input.occurredAt;
  }

  assignResponsible(input: { responsibleUserId: string; occurredAt: Date }): void {
    this.props.responsibleUserId = input.responsibleUserId;
    this.props.updatedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableId(): string {
    return this.props.deliverableId;
  }
  get name(): string {
    return this.props.name;
  }
  get source(): string | undefined {
    return this.props.source;
  }
  get mandatory(): boolean {
    return this.props.mandatory;
  }
  get format(): string | undefined {
    return this.props.format;
  }
  get documentId(): string | undefined {
    return this.props.documentId;
  }
  get version(): string | undefined {
    return this.props.version;
  }
  get documentVersionId(): string | undefined {
    return this.props.documentVersionId;
  }
  get documentChecksum(): string | undefined {
    return this.props.documentChecksum;
  }
  get documentFileName(): string | undefined {
    return this.props.documentFileName;
  }
  get documentMimeType(): string | undefined {
    return this.props.documentMimeType;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get signatureRequired(): boolean {
    return this.props.signatureRequired;
  }
  get status(): ChecklistPieceStatus {
    return this.props.status;
  }
  get responsibleUserId(): string | undefined {
    return this.props.responsibleUserId;
  }
  get order(): number {
    return this.props.order;
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
