/**
 * Historique append-only d'une tentative de traitement d'un `AnalysisJob` (mission Sprint 4.1) —
 * même motif que `ExtractionAttempt` (module Extraction) : jamais de mise à jour ni de suppression
 * d'une tentative déjà enregistrée. `attemptNumber` correspond au `AnalysisJob.attemptCount` de la
 * réservation qui a produit cette tentative — un retry (nouvel `attemptCount`) crée toujours une
 * nouvelle ligne, jamais une mise à jour de la précédente.
 */
export type AnalysisAttemptProps = {
  id: string;
  jobId: string;
  organizationId: string;
  attemptNumber: number;
  trigger: string;
  provider?: string | undefined;
  model?: string | undefined;
  outcome: "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  /** Nombre de tentatives d'appel provider effectuées AU SEIN de cette réservation (politique de
   *  retry interne — mission §"Timeout et retry") — jamais confondu avec `attemptNumber`, qui
   *  compte les réservations (retries explicites via RetryAnalysisUseCase). */
  retryCount: number;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdAt: Date;
};

export class AnalysisAttempt {
  private constructor(private readonly props: AnalysisAttemptProps) {}

  static create(props: AnalysisAttemptProps): AnalysisAttempt {
    return new AnalysisAttempt(props);
  }

  static rehydrate(props: AnalysisAttemptProps): AnalysisAttempt {
    return new AnalysisAttempt(props);
  }

  get id(): string {
    return this.props.id;
  }
  get jobId(): string {
    return this.props.jobId;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get attemptNumber(): number {
    return this.props.attemptNumber;
  }
  get trigger(): string {
    return this.props.trigger;
  }
  get provider(): string | undefined {
    return this.props.provider;
  }
  get model(): string | undefined {
    return this.props.model;
  }
  get outcome(): "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" {
    return this.props.outcome;
  }
  get startedAt(): Date {
    return this.props.startedAt;
  }
  get finishedAt(): Date {
    return this.props.finishedAt;
  }
  get durationMs(): number {
    return this.props.durationMs;
  }
  get retryCount(): number {
    return this.props.retryCount;
  }
  get inputTokenCount(): number | undefined {
    return this.props.inputTokenCount;
  }
  get outputTokenCount(): number | undefined {
    return this.props.outputTokenCount;
  }
  get totalTokenCount(): number | undefined {
    return this.props.totalTokenCount;
  }
  get errorCode(): string | undefined {
    return this.props.errorCode;
  }
  get errorMessage(): string | undefined {
    return this.props.errorMessage;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
