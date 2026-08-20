import { InvalidTenderSubmissionStatusTransitionError } from "./errors";
import type { SubmissionPlatform } from "./submission-platform";
import type { SubmissionRejectionCategory } from "./submission-rejection-category";
import { canTransitionTenderSubmissionStatus, TenderSubmissionStatus } from "./tender-submission-status";

export type TenderSubmissionProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  /** Mission §18 — référence EXACTE, jamais "le dernier package" : figée à la création, jamais
   *  recalculée même si de nouvelles versions du package sont générées ensuite. */
  packageId: string;
  packageVersion: number;
  packageHash: string;
  manifestHash?: string | undefined;
  /** Checkpoint TENDEROS-2.1-P2.2-F2 — dossier de réponse V2 réellement soumis, figé à la création,
   *  jamais recalculé (même discipline que `packageId` ci-dessus). `undefined` pour une soumission
   *  antérieure à ce checkpoint ou pour un Tender dont le dossier V2 n'était pas résolvable sans
   *  ambiguïté (voir `GetSubmittableResponsePackageVersionUseCase`). */
  responsePackageVersionId?: string | undefined;
  responsePackageArtifactId?: string | undefined;
  responsePackageArtifactChecksum?: string | undefined;
  status: TenderSubmissionStatus;
  submittedByUserId?: string | undefined;
  submittedAt?: Date | undefined;
  platform: SubmissionPlatform;
  customPlatformName?: string | undefined;
  platformReference?: string | undefined;
  receiptReference?: string | undefined;
  notes?: string | undefined;
  supersedesSubmissionId?: string | undefined;
  replacedBySubmissionId?: string | undefined;
  withdrawnAt?: Date | undefined;
  withdrawnByUserId?: string | undefined;
  withdrawalReason?: string | undefined;
  cancelledAt?: Date | undefined;
  cancelledByUserId?: string | undefined;
  cancellationReason?: string | undefined;
  rejectionCategory?: SubmissionRejectionCategory | undefined;
  rejectionDescription?: string | undefined;
  receiptConfirmedAt?: Date | undefined;
  receiptConfirmedByUserId?: string | undefined;
  externalSubmissionUrl?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Sprint 9 — mission §6 : une soumission (dépôt manuel assisté) d'un Tender sur une plateforme
 * acheteur. Immuable dans ses références de package/version/hash une fois créée (mission §18) ;
 * seul le STATUT et les métadonnées de suivi évoluent, via des transitions explicites contrôlées
 * (mission §7) — jamais une réécriture rétroactive du contenu déposé.
 */
export class TenderSubmission {
  private constructor(private props: TenderSubmissionProps) {}

  /** Créée directement à SUBMITTED — mission §11 "enregistrement d'un dépôt" en une fois. */
  static record(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    packageId: string;
    packageVersion: number;
    packageHash: string;
    manifestHash?: string | undefined;
    responsePackageVersionId?: string | undefined;
    responsePackageArtifactId?: string | undefined;
    responsePackageArtifactChecksum?: string | undefined;
    submittedByUserId: string;
    submittedAt: Date;
    platform: SubmissionPlatform;
    customPlatformName?: string | undefined;
    platformReference?: string | undefined;
    receiptReference?: string | undefined;
    notes?: string | undefined;
    supersedesSubmissionId?: string | undefined;
    occurredAt: Date;
  }): TenderSubmission {
    return new TenderSubmission({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      packageHash: input.packageHash,
      manifestHash: input.manifestHash,
      responsePackageVersionId: input.responsePackageVersionId,
      responsePackageArtifactId: input.responsePackageArtifactId,
      responsePackageArtifactChecksum: input.responsePackageArtifactChecksum,
      status: TenderSubmissionStatus.Submitted,
      submittedByUserId: input.submittedByUserId,
      submittedAt: input.submittedAt,
      platform: input.platform,
      customPlatformName: input.customPlatformName,
      platformReference: input.platformReference,
      receiptReference: input.receiptReference,
      notes: input.notes,
      supersedesSubmissionId: input.supersedesSubmissionId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  /** Créée à SUBMISSION_IN_PROGRESS — mission §7/§23 "marquer le dépôt comme commencé", un pas
   *  optionnel avant `recordFromInProgress`. */
  static start(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    packageId: string;
    packageVersion: number;
    packageHash: string;
    manifestHash?: string | undefined;
    startedByUserId: string;
    platform: SubmissionPlatform;
    customPlatformName?: string | undefined;
    supersedesSubmissionId?: string | undefined;
    occurredAt: Date;
  }): TenderSubmission {
    return new TenderSubmission({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      packageId: input.packageId,
      packageVersion: input.packageVersion,
      packageHash: input.packageHash,
      manifestHash: input.manifestHash,
      status: TenderSubmissionStatus.SubmissionInProgress,
      submittedByUserId: input.startedByUserId,
      platform: input.platform,
      customPlatformName: input.customPlatformName,
      supersedesSubmissionId: input.supersedesSubmissionId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: TenderSubmissionProps): TenderSubmission {
    return new TenderSubmission(props);
  }

  private transitionTo(next: TenderSubmissionStatus, occurredAt: Date): void {
    if (!canTransitionTenderSubmissionStatus(this.props.status, next)) {
      throw new InvalidTenderSubmissionStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  /** SUBMISSION_IN_PROGRESS → SUBMITTED : complète le dépôt démarré avec ses informations réelles. */
  recordFromInProgress(input: {
    submittedByUserId: string;
    submittedAt: Date;
    platform: SubmissionPlatform;
    customPlatformName?: string | undefined;
    platformReference?: string | undefined;
    receiptReference?: string | undefined;
    notes?: string | undefined;
    /** Checkpoint TENDEROS-2.1-P2.2-F2.1 — ferme le gap identifié par l'audit F2 (le flux
     *  start()->recordFromInProgress() finalisait un dépôt réel sans jamais capturer la
     *  provenance V2, contrairement au flux direct `record()`). Mêmes champs, même discipline
     *  (figés à l'instant T, `undefined` si non résolvable sans ambiguïté). */
    responsePackageVersionId?: string | undefined;
    responsePackageArtifactId?: string | undefined;
    responsePackageArtifactChecksum?: string | undefined;
    occurredAt: Date;
  }): void {
    this.transitionTo(TenderSubmissionStatus.Submitted, input.occurredAt);
    this.props.submittedByUserId = input.submittedByUserId;
    this.props.submittedAt = input.submittedAt;
    this.props.platform = input.platform;
    this.props.customPlatformName = input.customPlatformName;
    this.props.platformReference = input.platformReference;
    this.props.receiptReference = input.receiptReference;
    this.props.notes = input.notes;
    this.props.responsePackageVersionId = input.responsePackageVersionId;
    this.props.responsePackageArtifactId = input.responsePackageArtifactId;
    this.props.responsePackageArtifactChecksum = input.responsePackageArtifactChecksum;
  }

  updateNotes(input: { notes: string | undefined; occurredAt: Date }): void {
    this.props.notes = input.notes;
    this.props.updatedAt = input.occurredAt;
  }

  updateReferences(input: { platformReference?: string | undefined; receiptReference?: string | undefined; occurredAt: Date }): void {
    if (input.platformReference !== undefined) this.props.platformReference = input.platformReference;
    if (input.receiptReference !== undefined) this.props.receiptReference = input.receiptReference;
    this.props.updatedAt = input.occurredAt;
  }

  confirmReceipt(input: { receiptReference?: string | undefined; confirmedByUserId: string; occurredAt: Date }): void {
    this.transitionTo(TenderSubmissionStatus.ReceiptConfirmed, input.occurredAt);
    if (input.receiptReference !== undefined) this.props.receiptReference = input.receiptReference;
    this.props.receiptConfirmedAt = input.occurredAt;
    this.props.receiptConfirmedByUserId = input.confirmedByUserId;
  }

  reject(input: { rejectionCategory: SubmissionRejectionCategory; rejectionDescription: string; occurredAt: Date }): void {
    this.transitionTo(TenderSubmissionStatus.SubmissionRejected, input.occurredAt);
    this.props.rejectionCategory = input.rejectionCategory;
    this.props.rejectionDescription = input.rejectionDescription;
  }

  /** Marquée REPLACED par le remplaçant — jamais par elle-même (`replacedBySubmissionId` posé par
   *  le use case, qui crée aussi la nouvelle soumission dans la MÊME transaction, mission §14). */
  markReplaced(input: { replacedBySubmissionId: string; occurredAt: Date }): void {
    this.transitionTo(TenderSubmissionStatus.Replaced, input.occurredAt);
    this.props.replacedBySubmissionId = input.replacedBySubmissionId;
  }

  withdraw(input: { withdrawnByUserId: string; withdrawalReason?: string | undefined; occurredAt: Date }): void {
    this.transitionTo(TenderSubmissionStatus.Withdrawn, input.occurredAt);
    this.props.withdrawnAt = input.occurredAt;
    this.props.withdrawnByUserId = input.withdrawnByUserId;
    this.props.withdrawalReason = input.withdrawalReason;
  }

  cancel(input: { cancelledByUserId: string; cancellationReason?: string | undefined; occurredAt: Date }): void {
    this.transitionTo(TenderSubmissionStatus.Cancelled, input.occurredAt);
    this.props.cancelledAt = input.occurredAt;
    this.props.cancelledByUserId = input.cancelledByUserId;
    this.props.cancellationReason = input.cancellationReason;
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
  get packageId(): string {
    return this.props.packageId;
  }
  get packageVersion(): number {
    return this.props.packageVersion;
  }
  get packageHash(): string {
    return this.props.packageHash;
  }
  get manifestHash(): string | undefined {
    return this.props.manifestHash;
  }
  get responsePackageVersionId(): string | undefined {
    return this.props.responsePackageVersionId;
  }
  get responsePackageArtifactId(): string | undefined {
    return this.props.responsePackageArtifactId;
  }
  get responsePackageArtifactChecksum(): string | undefined {
    return this.props.responsePackageArtifactChecksum;
  }
  get status(): TenderSubmissionStatus {
    return this.props.status;
  }
  get submittedByUserId(): string | undefined {
    return this.props.submittedByUserId;
  }
  get submittedAt(): Date | undefined {
    return this.props.submittedAt;
  }
  get platform(): SubmissionPlatform {
    return this.props.platform;
  }
  get customPlatformName(): string | undefined {
    return this.props.customPlatformName;
  }
  get platformReference(): string | undefined {
    return this.props.platformReference;
  }
  get receiptReference(): string | undefined {
    return this.props.receiptReference;
  }
  get notes(): string | undefined {
    return this.props.notes;
  }
  get supersedesSubmissionId(): string | undefined {
    return this.props.supersedesSubmissionId;
  }
  get replacedBySubmissionId(): string | undefined {
    return this.props.replacedBySubmissionId;
  }
  get withdrawnAt(): Date | undefined {
    return this.props.withdrawnAt;
  }
  get withdrawnByUserId(): string | undefined {
    return this.props.withdrawnByUserId;
  }
  get withdrawalReason(): string | undefined {
    return this.props.withdrawalReason;
  }
  get cancelledAt(): Date | undefined {
    return this.props.cancelledAt;
  }
  get cancelledByUserId(): string | undefined {
    return this.props.cancelledByUserId;
  }
  get cancellationReason(): string | undefined {
    return this.props.cancellationReason;
  }
  get rejectionCategory(): SubmissionRejectionCategory | undefined {
    return this.props.rejectionCategory;
  }
  get rejectionDescription(): string | undefined {
    return this.props.rejectionDescription;
  }
  get receiptConfirmedAt(): Date | undefined {
    return this.props.receiptConfirmedAt;
  }
  get receiptConfirmedByUserId(): string | undefined {
    return this.props.receiptConfirmedByUserId;
  }
  get externalSubmissionUrl(): string | undefined {
    return this.props.externalSubmissionUrl;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
