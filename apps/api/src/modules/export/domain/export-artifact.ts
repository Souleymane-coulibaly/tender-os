export type ExportManifest = Readonly<{
  exportId: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  templateId: string;
  templateVersionId: string;
  mode: string;
  format: string;
  documentType: string;
  version: number;
  sections: readonly Readonly<{
    sectionId: string;
    label: string;
    sourceType: string;
    generationId?: string | undefined;
    pricingEstimateId?: string | undefined;
    pricingEstimateVersionNumber?: number | undefined;
    validationStatus: string;
    order: number;
    /** Correctif audit Codex P1-001 — provenance Deliverables figée dans le manifest lui-même
     *  (jamais uniquement dans les logs), pour prouver après coup qu'un DOCX/PDF correspond
     *  exactement à la révision sélectionnée. */
    deliverableProvenance?:
      | Readonly<{
          deliverableId: string;
          deliverableSectionId: string;
          deliverableRevisionId: string;
          revisionNumber: number;
          validationStatus: string;
          selectedBy: string;
          selectedAt: string;
        }>
      | undefined;
  }>[];
  createdBy: string;
  createdAt: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  hashAlgorithm: string;
  storageKey: string;
  warnings: readonly string[];
  errors: readonly string[];
}>;

export type ExportArtifactProps = Readonly<{
  id: string;
  organizationId: string;
  exportJobId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  hashAlgorithm: string;
  storageKey: string;
  manifest: ExportManifest;
  warnings: readonly string[];
  errors: readonly string[];
  createdAt: Date;
}>;

/** Mission Sprint 8A §7/§25/§26 — créé UNE SEULE FOIS à la complétion d'un `ExportJob`, jamais
 *  modifié ensuite (mission "un artefact final ne peut pas être remplacé silencieusement"). */
export class ExportArtifact {
  private constructor(private readonly props: ExportArtifactProps) {}

  static create(props: ExportArtifactProps): ExportArtifact {
    if (props.fileSize <= 0) {
      throw new Error("fileSize must be positive");
    }
    if (!/^[a-f0-9]{64}$/.test(props.fileHash)) {
      throw new Error("fileHash must be a 64-character lowercase hexadecimal SHA-256 digest");
    }
    return new ExportArtifact(props);
  }

  static rehydrate(props: ExportArtifactProps): ExportArtifact {
    return new ExportArtifact(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get exportJobId(): string {
    return this.props.exportJobId;
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
  get hashAlgorithm(): string {
    return this.props.hashAlgorithm;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get manifest(): ExportManifest {
    return this.props.manifest;
  }
  get warnings(): readonly string[] {
    return this.props.warnings;
  }
  get errors(): readonly string[] {
    return this.props.errors;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
