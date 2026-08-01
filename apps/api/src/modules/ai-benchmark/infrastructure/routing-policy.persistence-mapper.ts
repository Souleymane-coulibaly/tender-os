import type { RoutingPolicy as RoutingPolicyRecord, Prisma } from "@prisma/client";
import type { EscalationCondition } from "../../analysis";
import { RoutingPolicy } from "../domain/routing-policy.aggregate";
import type { RoutingPolicyStatus } from "../domain/routing-policy-status";

export function toDomain(record: RoutingPolicyRecord): RoutingPolicy {
  return RoutingPolicy.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    promptKey: record.promptKey,
    version: record.version,
    status: record.status as RoutingPolicyStatus,
    primaryAiModelId: record.primaryAiModelId,
    escalationAiModelId: record.escalationAiModelId ?? undefined,
    confidenceThreshold: record.confidenceThreshold ? Number(record.confidenceThreshold) : undefined,
    provenanceRequired: record.provenanceRequired,
    timeoutMs: record.timeoutMs,
    maxRetries: record.maxRetries,
    escalationConditions: record.escalationConditions as EscalationCondition[],
    sourceRecommendationId: record.sourceRecommendationId ?? undefined,
    authorUserId: record.authorUserId,
    effectiveFrom: record.effectiveFrom ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(policy: RoutingPolicy) {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    promptKey: policy.promptKey,
    version: policy.version,
    status: policy.status,
    primaryAiModelId: policy.primaryAiModelId,
    escalationAiModelId: policy.escalationAiModelId ?? null,
    confidenceThreshold: policy.confidenceThreshold ?? null,
    provenanceRequired: policy.provenanceRequired,
    timeoutMs: policy.timeoutMs,
    maxRetries: policy.maxRetries,
    escalationConditions: policy.escalationConditions as unknown as Prisma.InputJsonValue,
    sourceRecommendationId: policy.sourceRecommendationId ?? null,
    authorUserId: policy.authorUserId,
    effectiveFrom: policy.effectiveFrom ?? null,
    archivedAt: policy.archivedAt ?? null,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}
