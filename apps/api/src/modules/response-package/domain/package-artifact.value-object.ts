export type PackageArtifactProps = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  manifest: Record<string, unknown>;
  generatedBy: string;
  generatedAt: Date;
};

/** Immuable, APPEND-ONLY (mission §63/§64 "même PackageVersion → même snapshot, ne jamais
 *  reprendre les latest documents") — pointeur de provenance vers le ZIP RÉEL (les octets vivent
 *  dans le stockage via `StorageProvider`, jamais ici). Une nouvelle génération pour la même
 *  version VALIDATED crée une NOUVELLE ligne, jamais une mise à jour en place. */
export class PackageArtifact {
  private constructor(private readonly props: PackageArtifactProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    responsePackageVersionId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    manifest: Record<string, unknown>;
    generatedBy: string;
    occurredAt: Date;
  }): PackageArtifact {
    return new PackageArtifact({
      id: input.id,
      organizationId: input.organizationId,
      responsePackageVersionId: input.responsePackageVersionId,
      storageKey: input.storageKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
      manifest: input.manifest,
      generatedBy: input.generatedBy,
      generatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: PackageArtifactProps): PackageArtifact {
    return new PackageArtifact(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get responsePackageVersionId(): string {
    return this.props.responsePackageVersionId;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get fileName(): string {
    return this.props.fileName;
  }
  get mimeType(): string {
    return this.props.mimeType;
  }
  get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  get checksum(): string {
    return this.props.checksum;
  }
  get manifest(): Record<string, unknown> {
    return this.props.manifest;
  }
  get generatedBy(): string {
    return this.props.generatedBy;
  }
  get generatedAt(): Date {
    return this.props.generatedAt;
  }
}
