export type AiModelStatus = "ENABLED" | "DISABLED";

export const AI_MODEL_STATUS_LABELS: Record<AiModelStatus, string> = {
  ENABLED: "Activé",
  DISABLED: "Désactivé",
};

export function aiModelStatusBadgeClass(status: AiModelStatus): string {
  return status === "ENABLED" ? "bg-green-100 text-green-800" : "bg-neutral-200 text-neutral-700";
}

export type AiModelCapabilities = {
  supportsStructuredOutput: boolean;
  supportsToolCalling: boolean;
  supportsVision: boolean;
};

export type AiModelSummary = {
  id: string;
  provider: string;
  modelKey: string;
  displayName: string;
  status: AiModelStatus;
  capabilities: AiModelCapabilities;
  maxContextTokens?: number;
  enabledForBenchmark: boolean;
  enabledForProduction: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PricingSnapshotSummary = {
  id: string;
  aiModelId: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  createdAt: string;
};

export type AllowedModelCatalog = Record<string, readonly string[]>;

export type PromptKey = "ANALYZE_DOCUMENT" | "CONSOLIDATE_TENDER_ANALYSIS";

export const PROMPT_KEY_LABELS: Record<PromptKey, string> = {
  ANALYZE_DOCUMENT: "Analyse de document",
  CONSOLIDATE_TENDER_ANALYSIS: "Consolidation de l'appel d'offres",
};

export type BenchmarkSuiteStatus = "DRAFT" | "PUBLISHED";

export const BENCHMARK_SUITE_STATUS_LABELS: Record<BenchmarkSuiteStatus, string> = {
  DRAFT: "Brouillon",
  PUBLISHED: "Publiée",
};

export type BenchmarkSuiteSummary = {
  id: string;
  name: string;
  version: number;
  promptKey: PromptKey;
  status: BenchmarkSuiteStatus;
  description?: string;
  createdByUserId: string;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkCaseSummary = {
  id: string;
  suiteId: string;
  inputVariables: Record<string, string>;
  expectedOutput: unknown;
  expectedProvenance?: unknown;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  language: "FR" | "EN";
  businessCategory?: string;
  createdAt: string;
};

export type BenchmarkRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" | "CANCELLED";

export const BENCHMARK_RUN_STATUS_LABELS: Record<BenchmarkRunStatus, string> = {
  PENDING: "En attente",
  RUNNING: "En cours",
  SUCCEEDED: "Réussi",
  PARTIALLY_SUCCEEDED: "Partiellement réussi",
  FAILED: "Échoué",
  CANCELLED: "Annulé",
};

export function benchmarkRunStatusBadgeClass(status: BenchmarkRunStatus): string {
  switch (status) {
    case "SUCCEEDED":
      return "bg-green-100 text-green-800";
    case "PARTIALLY_SUCCEEDED":
      return "bg-amber-100 text-amber-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "CANCELLED":
      return "bg-neutral-200 text-neutral-700";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

export type BenchmarkRunSummary = {
  id: string;
  organizationId: string;
  suiteId: string;
  suiteVersion: number;
  status: BenchmarkRunStatus;
  repetitions: number;
  concurrencyLimit: number;
  estimatedCostAmount: string;
  estimatedCostCurrency: string;
  costCeilingAmount?: string;
  launchedByUserId: string;
  launchedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelRequestedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkCostEstimate = { amount: string; currency: string };

export type BenchmarkCaseResultSummary = {
  id: string;
  runId: string;
  caseId: string;
  aiModelId: string;
  repetitionIndex: number;
  provider?: string;
  model?: string;
  totalTokenCount?: number;
  durationMs?: number;
  actualCostAmount?: string;
  evaluationPassed: boolean;
  evaluationScore: number;
  errorCode?: string;
  createdAt: string;
};

export type BenchmarkRunModelComparison = {
  aiModelId: string;
  averageScore: number;
  averageCostAmount: string;
  averageLatencyMs: number;
  failureRate: number;
  invalidJsonRate: number;
  eliminated: boolean;
  eliminationReason?: string;
  caseResultCount: number;
};

export type BenchmarkRunResults = {
  comparisons: BenchmarkRunModelComparison[];
  results: BenchmarkCaseResultSummary[];
};

export type ModelRecommendationStatus = "DRAFT" | "APPROVED" | "REJECTED";

export const MODEL_RECOMMENDATION_STATUS_LABELS: Record<ModelRecommendationStatus, string> = {
  DRAFT: "Brouillon",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
};

export type ModelRecommendationSummary = {
  id: string;
  organizationId: string;
  promptKey: PromptKey;
  runId: string;
  primaryAiModelId: string;
  escalationAiModelId?: string;
  score: number;
  avgCostAmount: string;
  avgCostCurrency: string;
  avgLatencyMs: number;
  confidence: number;
  reasons: string[];
  limitations: string[];
  status: ModelRecommendationStatus;
  generatedAt: string;
  decidedByUserId?: string;
  decidedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RoutingPolicyStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export const ROUTING_POLICY_STATUS_LABELS: Record<RoutingPolicyStatus, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Active",
  ARCHIVED: "Archivée",
};

export const ESCALATION_CONDITIONS = [
  "INVALID_JSON",
  "UNKNOWN_SOURCE",
  "CITATION_NOT_FOUND",
  "LOW_CONFIDENCE",
  "INCOMPLETE_RESULT",
  "PROVIDER_ERROR",
  "TIMEOUT",
] as const;

export const ESCALATION_CONDITION_LABELS: Record<(typeof ESCALATION_CONDITIONS)[number], string> = {
  INVALID_JSON: "JSON invalide",
  UNKNOWN_SOURCE: "Source inconnue",
  CITATION_NOT_FOUND: "Citation introuvable",
  LOW_CONFIDENCE: "Confiance faible",
  INCOMPLETE_RESULT: "Résultat incomplet",
  PROVIDER_ERROR: "Erreur fournisseur",
  TIMEOUT: "Délai dépassé",
};

export type RoutingPolicySummary = {
  id: string;
  organizationId: string;
  promptKey: PromptKey;
  version: number;
  status: RoutingPolicyStatus;
  primaryAiModelId: string;
  escalationAiModelId?: string;
  confidenceThreshold?: number;
  provenanceRequired: boolean;
  timeoutMs: number;
  maxRetries: number;
  escalationConditions: string[];
  sourceRecommendationId?: string;
  authorUserId: string;
  effectiveFrom?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};
