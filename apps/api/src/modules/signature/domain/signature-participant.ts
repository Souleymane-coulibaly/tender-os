export const SignatureParticipantStatus = {
  Pending: "PENDING",
  Sent: "SENT",
  Opened: "OPENED",
  Signed: "SIGNED",
  Declined: "DECLINED",
} as const;
export type SignatureParticipantStatus = (typeof SignatureParticipantStatus)[keyof typeof SignatureParticipantStatus];

export type SignatureParticipantProps = {
  id: string;
  organizationId: string;
  signatureTransactionId: string;
  signatoryId: string;
  providerParticipantId?: string | undefined;
  sequence: number;
  status: SignatureParticipantStatus;
  invitationRedirectUrl?: string | undefined;
  createdAt: Date;
};

/** Mission Sprint 8A §37/§43 — un signataire affecté à une transaction précise, avec sa propre
 *  progression (jusqu'à 50 participants selon la documentation Universign). */
export class SignatureParticipant {
  private constructor(private props: SignatureParticipantProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    signatureTransactionId: string;
    signatoryId: string;
    sequence: number;
    invitationRedirectUrl?: string | undefined;
    occurredAt: Date;
  }): SignatureParticipant {
    if (input.invitationRedirectUrl && !input.invitationRedirectUrl.startsWith("https://")) {
      throw new Error("invitationRedirectUrl must be an https:// URL");
    }
    return new SignatureParticipant({
      id: input.id,
      organizationId: input.organizationId,
      signatureTransactionId: input.signatureTransactionId,
      signatoryId: input.signatoryId,
      sequence: input.sequence,
      status: SignatureParticipantStatus.Pending,
      invitationRedirectUrl: input.invitationRedirectUrl,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SignatureParticipantProps): SignatureParticipant {
    return new SignatureParticipant(props);
  }

  updateStatus(input: { status: SignatureParticipantStatus; providerParticipantId?: string | undefined }): void {
    this.props.status = input.status;
    if (input.providerParticipantId) this.props.providerParticipantId = input.providerParticipantId;
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
  get signatoryId(): string {
    return this.props.signatoryId;
  }
  get providerParticipantId(): string | undefined {
    return this.props.providerParticipantId;
  }
  get sequence(): number {
    return this.props.sequence;
  }
  get status(): SignatureParticipantStatus {
    return this.props.status;
  }
  get invitationRedirectUrl(): string | undefined {
    return this.props.invitationRedirectUrl;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
