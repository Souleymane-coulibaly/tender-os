export const ProviderEventStatus = {
  Received: "RECEIVED",
  Processed: "PROCESSED",
  Rejected: "REJECTED",
  Ignored: "IGNORED",
} as const;
export type ProviderEventStatus = (typeof ProviderEventStatus)[keyof typeof ProviderEventStatus];

export type SignatureProviderEventProps = Readonly<{
  id: string;
  organizationId?: string | undefined;
  provider: string;
  providerEventId?: string | undefined;
  providerTransactionId?: string | undefined;
  eventType: string;
  receivedAt: Date;
  processedAt?: Date | undefined;
  status: ProviderEventStatus;
  payloadHash: string;
  signatureVerified: boolean;
  errorCode?: string | undefined;
  retryCount: number;
}>;

/**
 * Mission Sprint 8A §39/§45 — trace de CHAQUE événement webhook reçu, avant même réconciliation
 * (mission "rejeter une transaction inconnue" — la ligne existe quand même pour l'observabilité).
 * Jamais utilisée seule pour confirmer une signature : le webhook déclenche une relecture de la
 * transaction locale, jamais une confiance aveugle dans le JSON reçu (mission §44/§46).
 */
export class SignatureProviderEvent {
  private constructor(private readonly props: SignatureProviderEventProps) {}

  static create(props: SignatureProviderEventProps): SignatureProviderEvent {
    return new SignatureProviderEvent(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string | undefined {
    return this.props.organizationId;
  }
  get provider(): string {
    return this.props.provider;
  }
  get providerEventId(): string | undefined {
    return this.props.providerEventId;
  }
  get providerTransactionId(): string | undefined {
    return this.props.providerTransactionId;
  }
  get eventType(): string {
    return this.props.eventType;
  }
  get receivedAt(): Date {
    return this.props.receivedAt;
  }
  get processedAt(): Date | undefined {
    return this.props.processedAt;
  }
  get status(): ProviderEventStatus {
    return this.props.status;
  }
  get payloadHash(): string {
    return this.props.payloadHash;
  }
  get signatureVerified(): boolean {
    return this.props.signatureVerified;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get retryCount(): number {
    return this.props.retryCount;
  }
}
