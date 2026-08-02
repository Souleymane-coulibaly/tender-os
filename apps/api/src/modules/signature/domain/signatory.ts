import { SignatoryNotVerifiedError } from "./errors";

export const SignatoryStatus = {
  Pending: "PENDING",
  Verified: "VERIFIED",
  Rejected: "REJECTED",
} as const;
export type SignatoryStatus = (typeof SignatoryStatus)[keyof typeof SignatoryStatus];

export type SignatoryProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  userId?: string | undefined;
  firstName: string;
  lastName: string;
  professionalEmail: string;
  jobTitle?: string | undefined;
  organizationName?: string | undefined;
  authorityText?: string | undefined;
  authorityDocumentId?: string | undefined;
  validFrom?: Date | undefined;
  validUntil?: Date | undefined;
  status: SignatoryStatus;
  verifiedBy?: string | undefined;
  verifiedAt?: Date | undefined;
  createdBy: string;
  createdAt: Date;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mission Sprint 8A §37/§42 — un signataire et son pouvoir. `userId` est une référence MOLLE
 * uniquement (jamais de permission dérivée de ce lien) : "OWNER ou ADMIN TenderOS ≠ pouvoir
 * juridique automatique de signature". Le pouvoir n'est opposable qu'après `verify()` par un
 * humain autorisé — jamais présumé à la création.
 */
export class Signatory {
  private constructor(private props: SignatoryProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    userId?: string | undefined;
    firstName: string;
    lastName: string;
    professionalEmail: string;
    jobTitle?: string | undefined;
    organizationName?: string | undefined;
    authorityText?: string | undefined;
    authorityDocumentId?: string | undefined;
    validFrom?: Date | undefined;
    validUntil?: Date | undefined;
    createdBy: string;
    occurredAt: Date;
  }): Signatory {
    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new Error("firstName and lastName are required");
    }
    if (!EMAIL_PATTERN.test(input.professionalEmail)) {
      throw new Error("professionalEmail must be a valid email address");
    }
    if (input.validFrom && input.validUntil && input.validFrom > input.validUntil) {
      throw new Error("validFrom must be before validUntil");
    }
    return new Signatory({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      userId: input.userId,
      firstName: input.firstName,
      lastName: input.lastName,
      professionalEmail: input.professionalEmail,
      jobTitle: input.jobTitle,
      organizationName: input.organizationName,
      authorityText: input.authorityText,
      authorityDocumentId: input.authorityDocumentId,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      status: SignatoryStatus.Pending,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SignatoryProps): Signatory {
    return new Signatory(props);
  }

  verify(input: { verifiedBy: string; occurredAt: Date }): void {
    this.props.status = SignatoryStatus.Verified;
    this.props.verifiedBy = input.verifiedBy;
    this.props.verifiedAt = input.occurredAt;
  }

  reject(input: { verifiedBy: string; occurredAt: Date }): void {
    this.props.status = SignatoryStatus.Rejected;
    this.props.verifiedBy = input.verifiedBy;
    this.props.verifiedAt = input.occurredAt;
  }

  /** Mission §38 — vérifié avant toute préparation d'une transaction de signature. */
  assertVerified(occurredAt: Date): void {
    if (this.props.status !== SignatoryStatus.Verified) {
      throw new SignatoryNotVerifiedError();
    }
    if (this.props.validFrom && occurredAt < this.props.validFrom) {
      throw new SignatoryNotVerifiedError();
    }
    if (this.props.validUntil && occurredAt > this.props.validUntil) {
      throw new SignatoryNotVerifiedError();
    }
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get clientAccountId(): string {
    return this.props.clientAccountId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get userId(): string | undefined {
    return this.props.userId;
  }
  get firstName(): string {
    return this.props.firstName;
  }
  get lastName(): string {
    return this.props.lastName;
  }
  get professionalEmail(): string {
    return this.props.professionalEmail;
  }
  get jobTitle(): string | undefined {
    return this.props.jobTitle;
  }
  get organizationName(): string | undefined {
    return this.props.organizationName;
  }
  get authorityText(): string | undefined {
    return this.props.authorityText;
  }
  get authorityDocumentId(): string | undefined {
    return this.props.authorityDocumentId;
  }
  get validFrom(): Date | undefined {
    return this.props.validFrom;
  }
  get validUntil(): Date | undefined {
    return this.props.validUntil;
  }
  get status(): SignatoryStatus {
    return this.props.status;
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
}
