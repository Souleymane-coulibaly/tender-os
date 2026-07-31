import type { AiModel } from "../domain/ai-model.aggregate";
import type { BenchmarkCase } from "../domain/benchmark-case.entity";
import type { BenchmarkCaseResult } from "../domain/benchmark-case-result.entity";
import type { BenchmarkRun } from "../domain/benchmark-run.aggregate";
import type { BenchmarkSuite } from "../domain/benchmark-suite.aggregate";
import type { ModelRecommendation } from "../domain/model-recommendation.aggregate";
import type { AiModelPricingSnapshot } from "../domain/pricing-snapshot.entity";
import type { RoutingPolicy } from "../domain/routing-policy.aggregate";

export type AiModelSummary = {
  id: string;
  provider: string;
  modelKey: string;
  displayName: string;
  status: string;
  capabilities: {
    supportsStructuredOutput: boolean;
    supportsToolCalling: boolean;
    supportsVision: boolean;
  };
  maxContextTokens?: number | undefined;
  enabledForBenchmark: boolean;
  enabledForProduction: boolean;
  createdAt: string;
  updatedAt: string;
};

export function toAiModelSummary(model: AiModel): AiModelSummary {
  return {
    id: model.id,
    provider: model.provider,
    modelKey: model.modelKey,
    displayName: model.displayName,
    status: model.status,
    capabilities: { ...model.capabilities },
    maxContextTokens: model.maxContextTokens,
    enabledForBenchmark: model.enabledForBenchmark,
    enabledForProduction: model.enabledForProduction,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}

export type PricingSnapshotSummary = {
  id: string;
  aiModelId: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string | undefined;
  createdAt: string;
};

export function toPricingSnapshotSummary(snapshot: AiModelPricingSnapshot): PricingSnapshotSummary {
  return {
    id: snapshot.id,
    aiModelId: snapshot.aiModelId,
    inputPricePerMillionTokens: snapshot.inputPricePerMillionTokens,
    outputPricePerMillionTokens: snapshot.outputPricePerMillionTokens,
    currency: snapshot.currency,
    effectiveFrom: snapshot.effectiveFrom.toISOString(),
    effectiveTo: snapshot.effectiveTo?.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
  };
}

export type BenchmarkSuiteSummary = {
  id: string;
  name: string;
  version: number;
  promptKey: string;
  status: string;
  description?: string | undefined;
  createdByUserId: string;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
};

export function toBenchmarkSuiteSummary(suite: BenchmarkSuite, caseCount: number): BenchmarkSuiteSummary {
  return {
    id: suite.id,
    name: suite.name,
    version: suite.version,
    promptKey: suite.promptKey,
    status: suite.status,
    description: suite.description,
    createdByUserId: suite.createdByUserId,
    caseCount,
    createdAt: suite.createdAt.toISOString(),
    updatedAt: suite.updatedAt.toISOString(),
  };
}

export type BenchmarkCaseSummary = {
  id: string;
  suiteId: string;
  inputVariables: Record<string, string>;
  expectedOutput: unknown;
  expectedProvenance?: unknown | undefined;
  difficulty: string;
  language: string;
  businessCategory?: string | undefined;
  createdAt: string;
};

export function toBenchmarkCaseSummary(benchmarkCase: BenchmarkCase): BenchmarkCaseSummary {
  return {
    id: benchmarkCase.id,
    suiteId: benchmarkCase.suiteId,
    inputVariables: { ...benchmarkCase.inputVariables },
    expectedOutput: benchmarkCase.expectedOutput,
    expectedProvenance: benchmarkCase.expectedProvenance,
    difficulty: benchmarkCase.difficulty,
    language: benchmarkCase.language,
    businessCategory: benchmarkCase.businessCategory,
    createdAt: benchmarkCase.createdAt.toISOString(),
  };
}

export type BenchmarkRunSummary = {
  id: string;
  organizationId: string;
  suiteId: string;
  suiteVersion: number;
  status: string;
  repetitions: number;
  concurrencyLimit: number;
  estimatedCostAmount: string;
  estimatedCostCurrency: string;
  costCeilingAmount?: string | undefined;
  launchedByUserId: string;
  launchedAt: string;
  startedAt?: string | undefined;
  completedAt?: string | undefined;
  cancelRequestedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toBenchmarkRunSummary(run: BenchmarkRun): BenchmarkRunSummary {
  return {
    id: run.id,
    organizationId: run.organizationId,
    suiteId: run.suiteId,
    suiteVersion: run.suiteVersion,
    status: run.status,
    repetitions: run.repetitions,
    concurrencyLimit: run.concurrencyLimit,
    estimatedCostAmount: run.estimatedCostAmount,
    estimatedCostCurrency: run.estimatedCostCurrency,
    costCeilingAmount: run.costCeilingAmount,
    launchedByUserId: run.launchedByUserId,
    launchedAt: run.launchedAt.toISOString(),
    startedAt: run.startedAt?.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    cancelRequestedAt: run.cancelRequestedAt?.toISOString(),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export type BenchmarkCaseResultSummary = {
  id: string;
  runId: string;
  caseId: string;
  aiModelId: string;
  repetitionIndex: number;
  provider?: string | undefined;
  model?: string | undefined;
  totalTokenCount?: number | undefined;
  durationMs?: number | undefined;
  actualCostAmount?: string | undefined;
  evaluationPassed: boolean;
  evaluationScore: number;
  errorCode?: string | undefined;
  createdAt: string;
};

export function toBenchmarkCaseResultSummary(result: BenchmarkCaseResult): BenchmarkCaseResultSummary {
  return {
    id: result.id,
    runId: result.runId,
    caseId: result.caseId,
    aiModelId: result.aiModelId,
    repetitionIndex: result.repetitionIndex,
    provider: result.provider,
    model: result.model,
    totalTokenCount: result.totalTokenCount,
    durationMs: result.durationMs,
    actualCostAmount: result.actualCostAmount,
    evaluationPassed: result.evaluationPassed,
    evaluationScore: result.evaluationScore,
    errorCode: result.errorCode,
    createdAt: result.createdAt.toISOString(),
  };
}

/** Agrégat par modèle pour un run (Sprint 5.2 §"Classement") — calculé à la lecture (GROUP BY en
 *  mémoire sur les résultats du run), jamais persisté séparément (voir plan §2 — runs bornés en
 *  taille, pas de risque de performance à ce volume). */
export type BenchmarkRunModelComparison = {
  aiModelId: string;
  averageScore: number;
  averageCostAmount: string;
  averageLatencyMs: number;
  failureRate: number;
  invalidJsonRate: number;
  eliminated: boolean;
  eliminationReason?: string | undefined;
  caseResultCount: number;
};

export type ModelRecommendationSummary = {
  id: string;
  organizationId: string;
  promptKey: string;
  runId: string;
  primaryAiModelId: string;
  escalationAiModelId?: string | undefined;
  score: number;
  avgCostAmount: string;
  avgCostCurrency: string;
  avgLatencyMs: number;
  confidence: number;
  reasons: readonly string[];
  limitations: readonly string[];
  status: string;
  generatedAt: string;
  decidedByUserId?: string | undefined;
  decidedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toModelRecommendationSummary(recommendation: ModelRecommendation): ModelRecommendationSummary {
  return {
    id: recommendation.id,
    organizationId: recommendation.organizationId,
    promptKey: recommendation.promptKey,
    runId: recommendation.runId,
    primaryAiModelId: recommendation.primaryAiModelId,
    escalationAiModelId: recommendation.escalationAiModelId,
    score: recommendation.score,
    avgCostAmount: recommendation.avgCostAmount,
    avgCostCurrency: recommendation.avgCostCurrency,
    avgLatencyMs: recommendation.avgLatencyMs,
    confidence: recommendation.confidence,
    reasons: recommendation.reasons,
    limitations: recommendation.limitations,
    status: recommendation.status,
    generatedAt: recommendation.generatedAt.toISOString(),
    decidedByUserId: recommendation.decidedByUserId,
    decidedAt: recommendation.decidedAt?.toISOString(),
    createdAt: recommendation.createdAt.toISOString(),
    updatedAt: recommendation.updatedAt.toISOString(),
  };
}

export type RoutingPolicySummary = {
  id: string;
  organizationId: string;
  promptKey: string;
  version: number;
  status: string;
  primaryAiModelId: string;
  escalationAiModelId?: string | undefined;
  confidenceThreshold?: number | undefined;
  provenanceRequired: boolean;
  timeoutMs: number;
  maxRetries: number;
  escalationConditions: readonly string[];
  sourceRecommendationId?: string | undefined;
  authorUserId: string;
  effectiveFrom?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toRoutingPolicySummary(policy: RoutingPolicy): RoutingPolicySummary {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    promptKey: policy.promptKey,
    version: policy.version,
    status: policy.status,
    primaryAiModelId: policy.primaryAiModelId,
    escalationAiModelId: policy.escalationAiModelId,
    confidenceThreshold: policy.confidenceThreshold,
    provenanceRequired: policy.provenanceRequired,
    timeoutMs: policy.timeoutMs,
    maxRetries: policy.maxRetries,
    escalationConditions: policy.escalationConditions,
    sourceRecommendationId: policy.sourceRecommendationId,
    authorUserId: policy.authorUserId,
    effectiveFrom: policy.effectiveFrom?.toISOString(),
    archivedAt: policy.archivedAt?.toISOString(),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}
