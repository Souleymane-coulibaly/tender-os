import type { SignatureLevel } from "./signature-level";

export const SignatureRequirementStatus = {
  Detected: "DETECTED",
  Confirmed: "CONFIRMED",
  Rejected: "REJECTED",
  Unknown: "UNKNOWN",
} as const;
export type SignatureRequirementStatus = (typeof SignatureRequirementStatus)[keyof typeof SignatureRequirementStatus];

export const SignatureRequirementConfidence = {
  Low: "LOW",
  Medium: "MEDIUM",
  High: "HIGH",
} as const;
export type SignatureRequirementConfidence = (typeof SignatureRequirementConfidence)[keyof typeof SignatureRequirementConfidence];

export type SignatureRequirementProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  documentRef: string;
  sourceDce?: string | undefined;
  pageOrSection?: string | undefined;
  mandatory: boolean;
  momentText?: string | undefined;
  format?: string | undefined;
  levelExpected?: SignatureLevel | undefined;
  certificateRequirement?: string | undefined;
  signatoryExpected?: string | undefined;
  confidence: SignatureRequirementConfidence;
  status: SignatureRequirementStatus;
  confirmedBy?: string | undefined;
  confirmedAt?: Date | undefined;
  comment?: string | undefined;
  createdBy: string;
  createdAt: Date;
};

/**
 * Mission Sprint 8A §36/§40 — une exigence de signature détectée (assistée ou saisie humaine).
 * Reste DETECTED/UNKNOWN tant qu'aucun humain ne l'a confirmée : "une détection automatique ne
 * doit pas devenir obligatoire sans confirmation humaine" — seule `confirm()` la rend contraignante
 * pour la suite du flux (préparation d'une signature).
 */
export class SignatureRequirement {
  private constructor(private props: SignatureRequirementProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    documentRef: string;
    sourceDce?: string | undefined;
    pageOrSection?: string | undefined;
    mandatory: boolean;
    momentText?: string | undefined;
    format?: string | undefined;
    levelExpected?: SignatureLevel | undefined;
    certificateRequirement?: string | undefined;
    signatoryExpected?: string | undefined;
    confidence?: SignatureRequirementConfidence | undefined;
    createdBy: string;
    occurredAt: Date;
  }): SignatureRequirement {
    if (!input.documentRef.trim()) {
      throw new Error("documentRef is required");
    }
    return new SignatureRequirement({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      documentRef: input.documentRef,
      sourceDce: input.sourceDce,
      pageOrSection: input.pageOrSection,
      mandatory: input.mandatory,
      momentText: input.momentText,
      format: input.format,
      levelExpected: input.levelExpected,
      certificateRequirement: input.certificateRequirement,
      signatoryExpected: input.signatoryExpected,
      confidence: input.confidence ?? SignatureRequirementConfidence.Medium,
      status: SignatureRequirementStatus.Detected,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SignatureRequirementProps): SignatureRequirement {
    return new SignatureRequirement(props);
  }

  confirm(input: { confirmedBy: string; comment?: string | undefined; occurredAt: Date }): void {
    this.props.status = SignatureRequirementStatus.Confirmed;
    this.props.confirmedBy = input.confirmedBy;
    this.props.confirmedAt = input.occurredAt;
    this.props.comment = input.comment;
  }

  reject(input: { confirmedBy: string; comment?: string | undefined; occurredAt: Date }): void {
    this.props.status = SignatureRequirementStatus.Rejected;
    this.props.confirmedBy = input.confirmedBy;
    this.props.confirmedAt = input.occurredAt;
    this.props.comment = input.comment;
  }

  get isConfirmed(): boolean {
    return this.props.status === SignatureRequirementStatus.Confirmed;
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
  get documentRef(): string {
    return this.props.documentRef;
  }
  get sourceDce(): string | undefined {
    return this.props.sourceDce;
  }
  get pageOrSection(): string | undefined {
    return this.props.pageOrSection;
  }
  get mandatory(): boolean {
    return this.props.mandatory;
  }
  get momentText(): string | undefined {
    return this.props.momentText;
  }
  get format(): string | undefined {
    return this.props.format;
  }
  get levelExpected(): SignatureLevel | undefined {
    return this.props.levelExpected;
  }
  get certificateRequirement(): string | undefined {
    return this.props.certificateRequirement;
  }
  get signatoryExpected(): string | undefined {
    return this.props.signatoryExpected;
  }
  get confidence(): SignatureRequirementConfidence {
    return this.props.confidence;
  }
  get status(): SignatureRequirementStatus {
    return this.props.status;
  }
  get confirmedBy(): string | undefined {
    return this.props.confirmedBy;
  }
  get confirmedAt(): Date | undefined {
    return this.props.confirmedAt;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
