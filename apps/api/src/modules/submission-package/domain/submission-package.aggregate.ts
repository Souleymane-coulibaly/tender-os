import { DuplicateArchivePathError, PackageNotReadyError } from "./errors";
import type { PackageFile } from "./package-file";
import { canTransitionPackageStatus, PackageStatus } from "./package-status";

export type SubmissionPackageProps = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  version: number;
  status: PackageStatus;
  validationRunId: string;
  approvalId: string;
  readinessStatus: string;
  files: readonly PackageFile[];
  fileName?: string | undefined;
  mimeType?: string | undefined;
  fileSize?: number | undefined;
  fileHash?: string | undefined;
  storageKey?: string | undefined;
  /** Checkpoint TENDEROS-2.1-P2.2-F4.1 — provenance du `PackageArtifact` V2 dont ce package est le
   *  wrapper, figée une seule fois à `create()`, jamais réévaluée. `undefined` pour tout package
   *  antérieur à ce checkpoint (jamais backfillé). */
  responsePackageVersionId?: string | undefined;
  responsePackageArtifactId?: string | undefined;
  responsePackageArtifactChecksum?: string | undefined;
  createdBy: string;
  createdAt: Date;
  completedAt?: Date | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
};

/**
 * Mission Sprint 8A §10/§52/§53 — le package final. Immuable après COMPLETED (mission "un package
 * final est immuable") : un nouveau contenu produit une nouvelle ligne (`version` incrémentée),
 * jamais une mise à jour en place.
 */
export class SubmissionPackage {
  private constructor(private props: SubmissionPackageProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    clientAccountId: string;
    tenderId: string;
    version: number;
    validationRunId: string;
    approvalId: string;
    readinessStatus: string;
    files: readonly PackageFile[];
    responsePackageVersionId?: string | undefined;
    responsePackageArtifactId?: string | undefined;
    responsePackageArtifactChecksum?: string | undefined;
    createdBy: string;
    occurredAt: Date;
  }): SubmissionPackage {
    if (input.files.length === 0) {
      throw new PackageNotReadyError("a package must contain at least one file");
    }
    const seenPaths = new Set<string>();
    for (const file of input.files) {
      if (seenPaths.has(file.archivePath)) {
        throw new DuplicateArchivePathError(file.archivePath);
      }
      seenPaths.add(file.archivePath);
    }
    return new SubmissionPackage({
      id: input.id,
      organizationId: input.organizationId,
      clientAccountId: input.clientAccountId,
      tenderId: input.tenderId,
      version: input.version,
      status: PackageStatus.Pending,
      validationRunId: input.validationRunId,
      approvalId: input.approvalId,
      readinessStatus: input.readinessStatus,
      files: input.files,
      responsePackageVersionId: input.responsePackageVersionId,
      responsePackageArtifactId: input.responsePackageArtifactId,
      responsePackageArtifactChecksum: input.responsePackageArtifactChecksum,
      createdBy: input.createdBy,
      createdAt: input.occurredAt,
    });
  }

  static rehydrate(props: SubmissionPackageProps): SubmissionPackage {
    return new SubmissionPackage(props);
  }

  private transitionTo(next: PackageStatus): void {
    if (!canTransitionPackageStatus(this.props.status, next)) {
      throw new PackageNotReadyError(`cannot transition package from ${this.props.status} to ${next}`);
    }
    this.props.status = next;
  }

  markGenerating(): void {
    this.transitionTo(PackageStatus.Generating);
  }

  markCompleted(input: { fileName: string; mimeType: string; fileSize: number; fileHash: string; storageKey: string; occurredAt: Date }): void {
    this.transitionTo(PackageStatus.Completed);
    this.props.fileName = input.fileName;
    this.props.mimeType = input.mimeType;
    this.props.fileSize = input.fileSize;
    this.props.fileHash = input.fileHash;
    this.props.storageKey = input.storageKey;
    this.props.completedAt = input.occurredAt;
  }

  markFailed(input: { errorCode: string; errorMessage: string; occurredAt: Date }): void {
    this.transitionTo(PackageStatus.Failed);
    this.props.errorCode = input.errorCode;
    this.props.errorMessage = input.errorMessage;
    this.props.completedAt = input.occurredAt;
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
  get version(): number {
    return this.props.version;
  }
  get status(): PackageStatus {
    return this.props.status;
  }
  get validationRunId(): string {
    return this.props.validationRunId;
  }
  get approvalId(): string {
    return this.props.approvalId;
  }
  get readinessStatus(): string {
    return this.props.readinessStatus;
  }
  get files(): readonly PackageFile[] {
    return this.props.files;
  }
  get fileName(): string | undefined {
    return this.props.fileName;
  }
  get mimeType(): string | undefined {
    return this.props.mimeType;
  }
  get fileSize(): number | undefined {
    return this.props.fileSize;
  }
  get fileHash(): string | undefined {
    return this.props.fileHash;
  }
  get storageKey(): string | undefined {
    return this.props.storageKey;
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
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
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
