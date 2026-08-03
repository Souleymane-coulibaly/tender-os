import { DceImportJobStatus, isAllowedDceImportJobTransition } from "./dce-import-job-status";
import { InvalidDceImportJobStatusTransitionError } from "./errors";
import type { ImportDceFilesResult } from "../application/use-cases/import-dce-files.use-case";

export type DceImportJobProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  status: DceImportJobStatus;
  originalFilename: string;
  sizeBytes: number;
  totalFiles?: number | undefined;
  acceptedCount?: number | undefined;
  rejectedCount?: number | undefined;
  result?: ImportDceFilesResult | undefined;
  errorMessage?: string | undefined;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | undefined;
};

/**
 * Suivi d'un import ZIP asynchrone (mission Sprint 8A.2, correction bug #3) — la requête HTTP crée
 * cette ligne à l'état CREATED et répond immédiatement ; tout le reste (extraction, import
 * fichier-par-fichier) se déroule en tâche de fond et fait progresser ce statut. Jamais de retour
 * en arrière une fois un état terminal atteint (READY/PARTIALLY_READY/FAILED/CANCELLED) — même
 * philosophie que `DocumentExtraction`/`AnalysisJob`.
 */
export class DceImportJob {
  private constructor(private props: DceImportJobProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    originalFilename: string;
    sizeBytes: number;
    createdByUserId: string;
    occurredAt: Date;
  }): DceImportJob {
    return new DceImportJob({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      status: DceImportJobStatus.Created,
      originalFilename: input.originalFilename,
      sizeBytes: input.sizeBytes,
      createdByUserId: input.createdByUserId,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DceImportJobProps): DceImportJob {
    return new DceImportJob(props);
  }

  private transitionTo(next: DceImportJobStatus, occurredAt: Date): void {
    if (!isAllowedDceImportJobTransition(this.props.status, next)) {
      throw new InvalidDceImportJobStatusTransitionError({ from: this.props.status, to: next });
    }
    this.props.status = next;
    this.props.updatedAt = occurredAt;
  }

  markExtracting(occurredAt: Date): void {
    this.transitionTo(DceImportJobStatus.Extracting, occurredAt);
  }

  markImporting(occurredAt: Date, totalFiles: number): void {
    this.transitionTo(DceImportJobStatus.Importing, occurredAt);
    this.props.totalFiles = totalFiles;
  }

  markCompleted(result: ImportDceFilesResult, occurredAt: Date): void {
    const status = result.rejected.length === 0 ? DceImportJobStatus.Ready : DceImportJobStatus.PartiallyReady;
    this.transitionTo(status, occurredAt);
    this.props.result = result;
    this.props.acceptedCount = result.accepted.length;
    this.props.rejectedCount = result.rejected.length;
    this.props.completedAt = occurredAt;
  }

  /** Message toujours sanitizé par l'appelant (jamais une pile d'appel ni un détail interne) —
   *  mission §"erreurs techniques affichées brutes". */
  markFailed(errorMessage: string, occurredAt: Date): void {
    this.transitionTo(DceImportJobStatus.Failed, occurredAt);
    this.props.errorMessage = errorMessage;
    this.props.completedAt = occurredAt;
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
  get status(): DceImportJobStatus {
    return this.props.status;
  }
  get originalFilename(): string {
    return this.props.originalFilename;
  }
  get sizeBytes(): number {
    return this.props.sizeBytes;
  }
  get totalFiles(): number | undefined {
    return this.props.totalFiles;
  }
  get acceptedCount(): number | undefined {
    return this.props.acceptedCount;
  }
  get rejectedCount(): number | undefined {
    return this.props.rejectedCount;
  }
  get result(): ImportDceFilesResult | undefined {
    return this.props.result;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }
}
