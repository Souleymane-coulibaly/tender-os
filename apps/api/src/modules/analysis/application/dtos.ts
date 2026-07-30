import type { AnalysisJob } from "../domain/analysis-job.aggregate";

export type AnalysisJobSummary = {
  id: string;
  organizationId: string;
  tenderId: string;
  dceId?: string | undefined;
  documentId?: string | undefined;
  scope: string;
  status: string;
  provider?: string | undefined;
  model?: string | undefined;
  analysisVersion: number;
  promptVersion: number;
  extractionVersion?: number | undefined;
  attemptCount: number;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  durationMs?: number | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  resultSummary?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toAnalysisJobSummary(job: AnalysisJob): AnalysisJobSummary {
  return {
    id: job.id,
    organizationId: job.organizationId,
    tenderId: job.tenderId,
    dceId: job.dceId,
    documentId: job.documentId,
    scope: job.scope,
    status: job.status,
    provider: job.provider,
    model: job.model,
    analysisVersion: job.analysisVersion,
    promptVersion: job.promptVersion,
    extractionVersion: job.extractionVersion,
    attemptCount: job.attemptCount,
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    durationMs: job.durationMs,
    inputTokenCount: job.inputTokenCount,
    outputTokenCount: job.outputTokenCount,
    totalTokenCount: job.totalTokenCount,
    resultSummary: job.resultSummary,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
