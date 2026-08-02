export const SignatureArtifactKind = {
  SignedDocument: "SIGNED_DOCUMENT",
  Proof: "PROOF",
} as const;
export type SignatureArtifactKind = (typeof SignatureArtifactKind)[keyof typeof SignatureArtifactKind];

export const SignatureArtifactSource = {
  Provider: "PROVIDER",
  ManualImport: "MANUAL_IMPORT",
} as const;
export type SignatureArtifactSource = (typeof SignatureArtifactSource)[keyof typeof SignatureArtifactSource];

/** Mission Sprint 8A §40/§48 — statuts d'un document signé APRÈS import/récupération, jamais
 *  automatiquement VERIFIED (mission "un import manuel ne doit pas être automatiquement marqué
 *  VERIFIED", "un statut SIGNED non vérifié ne doit pas produire automatiquement VERIFIED"). */
export const SignatureArtifactVerificationStatus = {
  Imported: "IMPORTED",
  ToVerify: "TO_VERIFY",
  Verified: "VERIFIED",
  Invalid: "INVALID",
  Rejected: "REJECTED",
} as const;
export type SignatureArtifactVerificationStatus = (typeof SignatureArtifactVerificationStatus)[keyof typeof SignatureArtifactVerificationStatus];

export type SignatureArtifactProps = {
  id: string;
  organizationId: string;
  signatureTransactionId: string;
  kind: SignatureArtifactKind;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  storageKey: string;
  providerArtifactId?: string | undefined;
  isFakeTestEvidence: boolean;
  source: SignatureArtifactSource;
  importedBy?: string | undefined;
  verificationStatus?: SignatureArtifactVerificationStatus | undefined;
  verifiedBy?: string | undefined;
  verifiedAt?: Date | undefined;
  createdAt: Date;
};

/**
 * Mission Sprint 8A §41/§49/§50 — un document signé récupéré (prestataire ou import manuel) ou
 * une preuve de signature. `isFakeTestEvidence` marque explicitement tout artefact produit par le
 * fake provider : "FAKE_TEST_EVIDENCE... jamais confondue avec une preuve réelle".
 */
export class SignatureArtifact {
  private constructor(private props: SignatureArtifactProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    signatureTransactionId: string;
    kind: SignatureArtifactKind;
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileHash: string;
    storageKey: string;
    providerArtifactId?: string | undefined;
    isFakeTestEvidence?: boolean | undefined;
    source: SignatureArtifactSource;
    importedBy?: string | undefined;
    occurredAt: Date;
  }): SignatureArtifact {
    if (input.fileSize <= 0) {
      throw new Error("fileSize must be positive");
    }
    if (!/^[a-f0-9]{64}$/.test(input.fileHash)) {
      throw new Error("fileHash must be a 64-character lowercase hexadecimal SHA-256 digest");
    }
    const verificationStatus =
      input.kind === SignatureArtifactKind.SignedDocument
        ? input.source === SignatureArtifactSource.ManualImport
          ? SignatureArtifactVerificationStatus.Imported
          : SignatureArtifactVerificationStatus.ToVerify
        : undefined;
    return new SignatureArtifact({
      id: input.id,
      organizationId: input.organizationId,
      signatureTransactionId: input.signatureTransactionId,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      fileHash: input.fileHash,
      storageKey: input.storageKey,
      providerArtifactId: input.providerArtifactId,
      isFakeTestEvidence: input.isFakeTestEvidence ?? false,
      source: input.source,
      importedBy: input.importedBy,
      verificationStatus,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SignatureArtifactProps): SignatureArtifact {
    return new SignatureArtifact(props);
  }

  /** Mission §51 — la vérification d'intégrité doit être RÉELLEMENT effectuée avant de marquer
   *  VERIFIED (jamais une déclaration sans contrôle). */
  markVerified(input: { verifiedBy: string; occurredAt: Date }): void {
    this.props.verificationStatus = SignatureArtifactVerificationStatus.Verified;
    this.props.verifiedBy = input.verifiedBy;
    this.props.verifiedAt = input.occurredAt;
  }

  markInvalid(input: { verifiedBy: string; occurredAt: Date }): void {
    this.props.verificationStatus = SignatureArtifactVerificationStatus.Invalid;
    this.props.verifiedBy = input.verifiedBy;
    this.props.verifiedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get signatureTransactionId(): string {
    return this.props.signatureTransactionId;
  }
  get kind(): SignatureArtifactKind {
    return this.props.kind;
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
  get storageKey(): string {
    return this.props.storageKey;
  }
  get providerArtifactId(): string | undefined {
    return this.props.providerArtifactId;
  }
  get isFakeTestEvidence(): boolean {
    return this.props.isFakeTestEvidence;
  }
  get source(): SignatureArtifactSource {
    return this.props.source;
  }
  get importedBy(): string | undefined {
    return this.props.importedBy;
  }
  get verificationStatus(): SignatureArtifactVerificationStatus | undefined {
    return this.props.verificationStatus;
  }
  get verifiedBy(): string | undefined {
    return this.props.verifiedBy;
  }
  get verifiedAt(): Date | undefined {
    return this.props.verifiedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
