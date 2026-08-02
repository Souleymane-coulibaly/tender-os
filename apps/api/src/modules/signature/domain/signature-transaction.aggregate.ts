import { InvalidSignatureTransactionTransitionError } from "./errors";
import type { SignatureLevel } from "./signature-level";
import type { SignatureProviderName } from "./signature-level";
import { canTransitionSignatureTransaction, SignatureTransactionStatus } from "./signature-transaction-status";

export type SignatureTransactionProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportArtifactId: string;
  provider: SignatureProviderName;
  providerTransactionId?: string | undefined;
  status: SignatureTransactionStatus;
  requestedLevel?: SignatureLevel | undefined;
  confirmedLevel?: SignatureLevel | undefined;
  levelSource?: string | undefined;
  documentHash: string;
  createdBy: string;
  createdAt: Date;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

/**
 * Mission Sprint 8A §33/§38/§43 — une transaction de signature LOCALE, préparée puis exécutée
 * (fake ou réelle) chez le prestataire. Porte TOUJOURS sur un `ExportArtifact` FINAL figé,
 * vérifié par l'application avant `create()` (mission §38/§39 — cette vérification n'est PAS
 * répétée ici, le domaine Signature n'a pas de dépendance vers Export). `documentHash` gèle la
 * preuve d'intégrité au moment de la préparation.
 */
export class SignatureTransaction {
  private constructor(private props: SignatureTransactionProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    exportArtifactId: string;
    provider: SignatureProviderName;
    requestedLevel?: SignatureLevel | undefined;
    levelSource?: string | undefined;
    documentHash: string;
    createdBy: string;
    occurredAt: Date;
  }): SignatureTransaction {
    if (!/^[a-f0-9]{64}$/.test(input.documentHash)) {
      throw new Error("documentHash must be a 64-character lowercase hexadecimal SHA-256 digest");
    }
    return new SignatureTransaction({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      exportArtifactId: input.exportArtifactId,
      provider: input.provider,
      status: SignatureTransactionStatus.Preparing,
      requestedLevel: input.requestedLevel,
      levelSource: input.levelSource,
      documentHash: input.documentHash,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SignatureTransactionProps): SignatureTransaction {
    return new SignatureTransaction(props);
  }

  private transitionTo(next: SignatureTransactionStatus): void {
    if (!canTransitionSignatureTransaction(this.props.status, next)) {
      throw new InvalidSignatureTransactionTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
  }

  markReadyToSend(input: { providerTransactionId: string; confirmedLevel?: SignatureLevel | undefined }): void {
    this.transitionTo(SignatureTransactionStatus.ReadyToSend);
    this.props.providerTransactionId = input.providerTransactionId;
    this.props.confirmedLevel = input.confirmedLevel;
  }

  markSent(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Sent);
    this.props.startedAt = occurredAt;
  }

  markInProgress(): void {
    this.transitionTo(SignatureTransactionStatus.InProgress);
  }

  markSigned(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Signed);
    this.props.completedAt = occurredAt;
  }

  /** Mission §46/§51 — la SEULE voie légitime vers VERIFIED : après contrôle d'intégrité RÉEL du
   *  document signé récupéré (jamais uniquement sur la base du JSON provider). */
  markVerified(): void {
    this.transitionTo(SignatureTransactionStatus.Verified);
  }

  markDeclined(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Declined);
    this.props.completedAt = occurredAt;
  }

  markCancelled(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Cancelled);
    this.props.completedAt = occurredAt;
  }

  markExpired(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Expired);
    this.props.completedAt = occurredAt;
  }

  markFailed(input: { errorCode: string; errorMessage: string; occurredAt: Date }): void {
    this.transitionTo(SignatureTransactionStatus.Failed);
    this.props.completedAt = input.occurredAt;
    this.props.errorCode = input.errorCode;
    this.props.errorMessage = input.errorMessage;
  }

  /** Mission §32/§38 — invalidée si le document original change après préparation. */
  markInvalid(occurredAt: Date): void {
    this.transitionTo(SignatureTransactionStatus.Invalid);
    this.props.completedAt = occurredAt;
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
  get exportArtifactId(): string {
    return this.props.exportArtifactId;
  }
  get provider(): SignatureProviderName {
    return this.props.provider;
  }
  get providerTransactionId(): string | undefined {
    return this.props.providerTransactionId;
  }
  get status(): SignatureTransactionStatus {
    return this.props.status;
  }
  get requestedLevel(): SignatureLevel | undefined {
    return this.props.requestedLevel;
  }
  get confirmedLevel(): SignatureLevel | undefined {
    return this.props.confirmedLevel;
  }
  get levelSource(): string | undefined {
    return this.props.levelSource;
  }
  get documentHash(): string {
    return this.props.documentHash;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
}
