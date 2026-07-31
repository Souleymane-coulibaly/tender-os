import type { ModelRecommendation as ModelRecommendationRecord, Prisma } from "@prisma/client";
import { ModelRecommendation } from "../domain/model-recommendation.aggregate";
import type { ModelRecommendationStatus } from "../domain/model-recommendation-status";
import type { PromptKey } from "../../analysis";

export function toDomain(record: ModelRecommendationRecord): ModelRecommendation {
  return ModelRecommendation.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    promptKey: record.promptKey as PromptKey,
    runId: record.runId,
    primaryAiModelId: record.primaryAiModelId,
    escalationAiModelId: record.escalationAiModelId ?? undefined,
    score: Number(record.score),
    avgCostAmount: record.avgCostAmount.toString(),
    avgCostCurrency: record.avgCostCurrency,
    avgLatencyMs: record.avgLatencyMs,
    confidence: Number(record.confidence),
    reasons: record.reasons as string[],
    limitations: record.limitations as string[],
    status: record.status as ModelRecommendationStatus,
    generatedAt: record.generatedAt,
    decidedByUserId: record.decidedByUserId ?? undefined,
    decidedAt: record.decidedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(recommendation: ModelRecommendation) {
  return {
    id: recommendation.id,
    organizationId: recommendation.organizationId,
    promptKey: recommendation.promptKey,
    runId: recommendation.runId,
    primaryAiModelId: recommendation.primaryAiModelId,
    escalationAiModelId: recommendation.escalationAiModelId ?? null,
    score: recommendation.score,
    avgCostAmount: recommendation.avgCostAmount,
    avgCostCurrency: recommendation.avgCostCurrency,
    avgLatencyMs: recommendation.avgLatencyMs,
    confidence: recommendation.confidence,
    reasons: recommendation.reasons as unknown as Prisma.InputJsonValue,
    limitations: recommendation.limitations as unknown as Prisma.InputJsonValue,
    status: recommendation.status,
    generatedAt: recommendation.generatedAt,
    decidedByUserId: recommendation.decidedByUserId ?? null,
    decidedAt: recommendation.decidedAt ?? null,
    createdAt: recommendation.createdAt,
    updatedAt: recommendation.updatedAt,
  };
}
