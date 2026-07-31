import type { BenchmarkCaseResult as BenchmarkCaseResultRecord, Prisma } from "@prisma/client";
import { BenchmarkCaseResult } from "../domain/benchmark-case-result.entity";

export function toDomain(record: BenchmarkCaseResultRecord): BenchmarkCaseResult {
  return BenchmarkCaseResult.rehydrate({
    id: record.id,
    runId: record.runId,
    caseId: record.caseId,
    aiModelId: record.aiModelId,
    pricingSnapshotId: record.pricingSnapshotId ?? undefined,
    repetitionIndex: record.repetitionIndex,
    provider: record.provider ?? undefined,
    model: record.model ?? undefined,
    rawOutput: record.rawOutput ?? undefined,
    inputTokenCount: record.inputTokenCount ?? undefined,
    outputTokenCount: record.outputTokenCount ?? undefined,
    totalTokenCount: record.totalTokenCount ?? undefined,
    durationMs: record.durationMs ?? undefined,
    actualCostAmount: record.actualCostAmount?.toString(),
    evaluationPassed: record.evaluationPassed,
    evaluationScore: Number(record.evaluationScore),
    evaluationDetails: record.evaluationDetails as Record<string, unknown>,
    eliminationSignal: { criticalHallucination: record.criticalHallucinationFlag, invalidProvenance: record.invalidProvenanceFlag },
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt,
  });
}

export function toPersistence(result: BenchmarkCaseResult) {
  return {
    id: result.id,
    runId: result.runId,
    caseId: result.caseId,
    aiModelId: result.aiModelId,
    pricingSnapshotId: result.pricingSnapshotId ?? null,
    repetitionIndex: result.repetitionIndex,
    provider: result.provider ?? null,
    model: result.model ?? null,
    rawOutput: result.rawOutput ?? null,
    inputTokenCount: result.inputTokenCount ?? null,
    outputTokenCount: result.outputTokenCount ?? null,
    totalTokenCount: result.totalTokenCount ?? null,
    durationMs: result.durationMs ?? null,
    actualCostAmount: result.actualCostAmount ?? null,
    evaluationPassed: result.evaluationPassed,
    evaluationScore: result.evaluationScore,
    evaluationDetails: result.evaluationDetails as Prisma.InputJsonValue,
    criticalHallucinationFlag: result.eliminationSignal?.criticalHallucination ?? false,
    invalidProvenanceFlag: result.eliminationSignal?.invalidProvenance ?? false,
    errorCode: result.errorCode ?? null,
    errorMessage: result.errorMessage ?? null,
    createdAt: result.createdAt,
  };
}
