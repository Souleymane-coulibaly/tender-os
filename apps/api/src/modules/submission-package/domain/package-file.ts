import { assertArchivePathIsContained } from "./archive-path-safety";

export const PackageFileSourceType = {
  ExportArtifact: "EXPORT_ARTIFACT",
  SignatureArtifact: "SIGNATURE_ARTIFACT",
  Manifest: "MANIFEST",
  /** Sprint 8C Phase 2 — pièce administrative validée (DC1/DC2/DC4/DUME/AE/attestations/pouvoirs...),
   *  incluse en LECTURE SEULE depuis `administrative-dossier`. */
  AdministrativeDocument: "ADMINISTRATIVE_DOCUMENT",
} as const;
export type PackageFileSourceType = (typeof PackageFileSourceType)[keyof typeof PackageFileSourceType];

export type PackageFileProps = Readonly<{
  archivePath: string;
  sourceType: PackageFileSourceType;
  sourceId?: string | undefined;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  order: number;
}>;

/** Mission Sprint 8A §53/§54 — un fichier inclus dans le ZIP final, avec son propre hash. */
export class PackageFile {
  private constructor(private readonly props: PackageFileProps) {}

  static create(input: PackageFileProps): PackageFile {
    assertArchivePathIsContained(input.archivePath);
    if (input.fileSize <= 0) {
      throw new Error("fileSize must be positive");
    }
    if (!/^[a-f0-9]{64}$/.test(input.fileHash)) {
      throw new Error("fileHash must be a 64-character lowercase hexadecimal SHA-256 digest");
    }
    return new PackageFile(input);
  }

  get archivePath(): string {
    return this.props.archivePath;
  }
  get sourceType(): PackageFileSourceType {
    return this.props.sourceType;
  }
  get sourceId(): string | undefined {
    return this.props.sourceId;
  }
  get fileName(): string {
    return this.props.fileName;
  }
  get mimeType(): string {
    return this.props.mimeType;
  }
  get fileSize(): number {
    return this.props.fileSize;
  }
  get fileHash(): string {
    return this.props.fileHash;
  }
  get order(): number {
    return this.props.order;
  }
}
