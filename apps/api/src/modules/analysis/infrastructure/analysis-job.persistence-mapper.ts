import type { AnalysisJob as AnalysisJobRecord } from "@prisma/client";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import type { AnalysisScope } from "../domain/analysis-scope";
import type { AnalysisStatus } from "../domain/analysis-status";

export type AnalysisJobPersistenceData = {
  id: string;
  organizationId: string;
  tenderId: string;
  dceId: string | null;
  documentId: string | null;
  targetId: string;
  scope: string;
  status: string;
  provider: string | null;
  model: string | null;
  analysisVersion: number;
  promptVersion: number;
  extractionVersion: number | null;
  inputChecksum: string | null;
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokenCount: number | null;
  resultSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomain(record: AnalysisJobRecord): AnalysisJob {
  return AnalysisJob.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    dceId: record.dceId ?? undefined,
    documentId: record.documentId ?? undefined,
    targetId: record.targetId,
    scope: record.scope as AnalysisScope,
    status: record.status as AnalysisStatus,
    provider: record.provider ?? undefined,
    model: record.model ?? undefined,
    analysisVersion: record.analysisVersion,
    promptVersion: record.promptVersion,
    extractionVersion: record.extractionVersion ?? undefined,
    inputChecksum: record.inputChecksum ?? undefined,
    attemptCount: record.attemptCount,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
    durationMs: record.durationMs ?? undefined,
    inputTokenCount: record.inputTokenCount ?? undefined,
    outputTokenCount: record.outputTokenCount ?? undefined,
    totalTokenCount: record.totalTokenCount ?? undefined,
    resultSummary: record.resultSummary ?? undefined,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(job: AnalysisJob): AnalysisJobPersistenceData {
  return {
    id: job.id,
    organizationId: job.organizationId,
    tenderId: job.tenderId,
    dceId: job.dceId ?? null,
    documentId: job.documentId ?? null,
    targetId: job.targetId,
    scope: job.scope,
    status: job.status,
    provider: job.provider ?? null,
    model: job.model ?? null,
    analysisVersion: job.analysisVersion,
    promptVersion: job.promptVersion,
    extractionVersion: job.extractionVersion ?? null,
    inputChecksum: job.inputChecksum ?? null,
    attemptCount: job.attemptCount,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    durationMs: job.durationMs ?? null,
    inputTokenCount: job.inputTokenCount ?? null,
    outputTokenCount: job.outputTokenCount ?? null,
    totalTokenCount: job.totalTokenCount ?? null,
    resultSummary: job.resultSummary ?? null,
    errorCode: job.errorCode ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
