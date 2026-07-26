import { DocumentArchivedError, DocumentDeletedError, DocumentNotArchivedError } from "./errors";
import { DocumentId } from "./document-id.value-object";
import type { DocumentDomain } from "./document-domain";
import type { DocumentOrigin } from "./document-origin";
import { DocumentStatus } from "./document-status";

export type DocumentProps = {
  id: DocumentId;
  organizationId: string;
  title: string;
  description?: string | undefined;
  origin: DocumentOrigin;
  domain: DocumentDomain;
  category?: string | undefined;
  status: DocumentStatus;
  currentVersionId?: string | undefined;
  currentVersionNumber: number;
  createdByUserId: string;
  updatedByUserId?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | undefined;
  deletedAt?: Date | undefined;
};

export type DocumentMetadataUpdate = {
  title?: string | undefined;
  description?: string | undefined;
  domain?: DocumentDomain | undefined;
  category?: string | undefined;
};

/**
 * Document logique — indépendant de ses versions physiques (conception §D). N'existe
 * jamais sans au moins une version : `currentVersionId` est nullable en base uniquement
 * pour permettre le bootstrap transactionnel de la création (voir CreateDocumentWithFirstVersion),
 * jamais nul une fois la création terminée avec succès.
 */
export class Document {
  private constructor(private props: DocumentProps) {}

  static create(input: {
    id: DocumentId;
    organizationId: string;
    title: string;
    description?: string | undefined;
    origin: DocumentOrigin;
    domain: DocumentDomain;
    category?: string | undefined;
    createdByUserId: string;
    occurredAt: Date;
  }): Document {
    return new Document({
      id: input.id,
      organizationId: input.organizationId,
      title: input.title,
      description: input.description,
      origin: input.origin,
      domain: input.domain,
      category: input.category,
      status: DocumentStatus.Active,
      currentVersionId: undefined,
      currentVersionNumber: 0,
      createdByUserId: input.createdByUserId,
      updatedByUserId: undefined,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      archivedAt: undefined,
      deletedAt: undefined,
    });
  }

  static rehydrate(props: DocumentProps): Document {
    return new Document(props);
  }

  /** Appelé juste après la persistance d'une nouvelle version (initiale ou suivante) pour
   *  faire pointer le document dessus — jamais appelé directement par un cas d'usage sans
   *  qu'une DocumentVersion correspondante n'ait déjà été créée. */
  promoteVersion(input: { versionId: string; versionNumber: number; occurredAt: Date }): void {
    this.assertNotArchived();
    this.assertNotDeleted();
    this.props.currentVersionId = input.versionId;
    this.props.currentVersionNumber = input.versionNumber;
    this.props.updatedAt = input.occurredAt;
  }

  updateMetadata(update: DocumentMetadataUpdate, updatedByUserId: string, occurredAt: Date): void {
    this.assertNotArchived();
    this.assertNotDeleted();

    if (update.title !== undefined) this.props.title = update.title;
    if (update.description !== undefined) this.props.description = update.description;
    if (update.domain !== undefined) this.props.domain = update.domain;
    if (update.category !== undefined) this.props.category = update.category;

    this.props.updatedByUserId = updatedByUserId;
    this.props.updatedAt = occurredAt;
  }

  archive(occurredAt: Date): void {
    this.assertNotDeleted();
    this.assertNotArchived();
    this.props.status = DocumentStatus.Archived;
    this.props.archivedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  restore(occurredAt: Date): void {
    this.assertNotDeleted();
    if (this.props.status !== DocumentStatus.Archived) {
      throw new DocumentNotArchivedError();
    }
    this.props.status = DocumentStatus.Active;
    this.props.archivedAt = undefined;
    this.props.updatedAt = occurredAt;
  }

  softDelete(occurredAt: Date): void {
    this.assertNotDeleted();
    this.props.deletedAt = occurredAt;
    this.props.updatedAt = occurredAt;
  }

  private assertNotArchived(): void {
    if (this.props.status === DocumentStatus.Archived) {
      throw new DocumentArchivedError();
    }
  }

  private assertNotDeleted(): void {
    if (this.props.deletedAt !== undefined) {
      throw new DocumentDeletedError();
    }
  }

  get id(): DocumentId {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | undefined {
    return this.props.description;
  }
  get origin(): DocumentOrigin {
    return this.props.origin;
  }
  get domain(): DocumentDomain {
    return this.props.domain;
  }
  get category(): string | undefined {
    return this.props.category;
  }
  get status(): DocumentStatus {
    return this.props.status;
  }
  get currentVersionId(): string | undefined {
    return this.props.currentVersionId;
  }
  get currentVersionNumber(): number {
    return this.props.currentVersionNumber;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get updatedByUserId(): string | undefined {
    return this.props.updatedByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get archivedAt(): Date | undefined {
    return this.props.archivedAt;
  }
  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }
}
