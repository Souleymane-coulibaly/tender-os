export type SigningPowerProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  holderName: string;
  representedEntityDescription: string;
  administrativeDocumentId?: string | undefined;
  validFrom?: Date | undefined;
  expiresAt?: Date | undefined;
  scope: string;
  limitations?: string | undefined;
  verifiedBy?: string | undefined;
  verifiedAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 8C Phase 2 — mission §17 : un pouvoir/délégation de signature, PLUSIEURS possibles par
 * Tender (un par signataire déclaré). Le statut (UNVERIFIED/VALID/EXPIRED) est DÉRIVÉ, jamais posé
 * directement — voir `deriveSigningPowerStatus`.
 */
export class SigningPower {
  private constructor(private props: SigningPowerProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    holderName: string;
    representedEntityDescription: string;
    validFrom?: Date | undefined;
    expiresAt?: Date | undefined;
    scope: string;
    limitations?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): SigningPower {
    return new SigningPower({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      holderName: input.holderName,
      representedEntityDescription: input.representedEntityDescription,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      scope: input.scope,
      limitations: input.limitations,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: SigningPowerProps): SigningPower {
    return new SigningPower(props);
  }

  update(input: {
    holderName?: string | undefined;
    representedEntityDescription?: string | undefined;
    validFrom?: Date | undefined;
    expiresAt?: Date | undefined;
    scope?: string | undefined;
    limitations?: string | undefined;
    occurredAt: Date;
  }): void {
    if (input.holderName !== undefined) this.props.holderName = input.holderName;
    if (input.representedEntityDescription !== undefined) this.props.representedEntityDescription = input.representedEntityDescription;
    if (input.validFrom !== undefined) this.props.validFrom = input.validFrom;
    if (input.expiresAt !== undefined) this.props.expiresAt = input.expiresAt;
    if (input.scope !== undefined) this.props.scope = input.scope;
    if (input.limitations !== undefined) this.props.limitations = input.limitations;
    // Toute modification substantielle rouvre la vérification — mission "jamais un pouvoir modifié
    // qui resterait vérifié sur son ancien contenu".
    this.props.verifiedBy = undefined;
    this.props.verifiedAt = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  linkDocument(input: { administrativeDocumentId: string; occurredAt: Date }): void {
    this.props.administrativeDocumentId = input.administrativeDocumentId;
    this.props.verifiedBy = undefined;
    this.props.verifiedAt = undefined;
    this.props.updatedAt = input.occurredAt;
  }

  /** Mission §17 — "preuve documentaire" exigée : refuse de vérifier un pouvoir sans document
   *  attaché. */
  verify(input: { verifiedBy: string; occurredAt: Date }): void {
    if (!this.props.administrativeDocumentId) {
      throw new Error("A signing power cannot be verified without an attached proof document.");
    }
    this.props.verifiedBy = input.verifiedBy;
    this.props.verifiedAt = input.occurredAt;
    this.props.updatedAt = input.occurredAt;
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
  get holderName(): string {
    return this.props.holderName;
  }
  get representedEntityDescription(): string {
    return this.props.representedEntityDescription;
  }
  get administrativeDocumentId(): string | undefined {
    return this.props.administrativeDocumentId;
  }
  get validFrom(): Date | undefined {
    return this.props.validFrom;
  }
  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }
  get scope(): string {
    return this.props.scope;
  }
  get limitations(): string | undefined {
    return this.props.limitations;
  }
  get verifiedBy(): string | undefined {
    return this.props.verifiedBy;
  }
  get verifiedAt(): Date | undefined {
    return this.props.verifiedAt;
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
