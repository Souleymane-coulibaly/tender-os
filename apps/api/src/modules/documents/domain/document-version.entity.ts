export type DocumentVersionProps = {
  id: string;
  organizationId: string;
  documentId: string;
  versionNumber: number;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksum: string;
  storageKey: string;
  uploadedByUserId: string;
  createdAt: Date;
};

/**
 * Version immuable d'un fichier précis (conception §D) — aucune méthode de mutation :
 * l'absence même de `updatedAt` matérialise cette immuabilité. Une nouvelle version ne
 * modifie jamais une version existante ; elle crée toujours une nouvelle ligne.
 */
export class DocumentVersion {
  private constructor(private readonly props: DocumentVersionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    documentId: string;
    versionNumber: number;
    originalFilename: string;
    sanitizedFilename: string;
    mimeType: string;
    extension: string;
    sizeBytes: number;
    checksum: string;
    storageKey: string;
    uploadedByUserId: string;
    occurredAt: Date;
  }): DocumentVersion {
    return new DocumentVersion({
      id: input.id,
      organizationId: input.organizationId,
      documentId: input.documentId,
      versionNumber: input.versionNumber,
      originalFilename: input.originalFilename,
      sanitizedFilename: input.sanitizedFilename,
      mimeType: input.mimeType,
      extension: input.extension,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      storageKey: input.storageKey,
      uploadedByUserId: input.uploadedByUserId,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: DocumentVersionProps): DocumentVersion {
    return new DocumentVersion(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get documentId(): string {
    return this.props.documentId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get originalFilename(): string {
    return this.props.originalFilename;
  }
  get sanitizedFilename(): string {
    return this.props.sanitizedFilename;
  }
  get mimeType(): string {
    return this.props.mimeType;
  }
  get extension(): string {
    return this.props.extension;
  }
  get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  get checksum(): string {
    return this.props.checksum;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get uploadedByUserId(): string {
    return this.props.uploadedByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
