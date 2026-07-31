import type {
  AiModelSummary,
  BenchmarkCaseResultSummary,
  BenchmarkCaseSummary,
  BenchmarkRunModelComparison,
  BenchmarkRunSummary,
  BenchmarkSuiteSummary,
  ModelRecommendationSummary,
  PricingSnapshotSummary,
  RoutingPolicySummary,
} from "../../application/dtos";

// Passe-plat volontaire (même motif que chaque autre module) — les DTO n'exposent déjà jamais de
// détail interne (jamais de clé/secret fournisseur).
export function presentAiModel(model: AiModelSummary): AiModelSummary {
  return { ...model };
}

export function presentPricingSnapshot(snapshot: PricingSnapshotSummary): PricingSnapshotSummary {
  return { ...snapshot };
}

export function presentBenchmarkSuite(suite: BenchmarkSuiteSummary): BenchmarkSuiteSummary {
  return { ...suite };
}

export function presentBenchmarkCase(benchmarkCase: BenchmarkCaseSummary): BenchmarkCaseSummary {
  return { ...benchmarkCase };
}

export function presentBenchmarkRun(run: BenchmarkRunSummary): BenchmarkRunSummary {
  return { ...run };
}

// rawOutput n'est volontairement jamais exposé ici — voir la sortie de
// `toBenchmarkCaseResultSummary` (application/dtos.ts), qui ne porte déjà pas ce champ.
export function presentBenchmarkCaseResult(result: BenchmarkCaseResultSummary): BenchmarkCaseResultSummary {
  return { ...result };
}

export function presentBenchmarkRunModelComparison(comparison: BenchmarkRunModelComparison): BenchmarkRunModelComparison {
  return { ...comparison };
}

export function presentModelRecommendation(recommendation: ModelRecommendationSummary): ModelRecommendationSummary {
  return { ...recommendation };
}

export function presentRoutingPolicy(policy: RoutingPolicySummary): RoutingPolicySummary {
  return { ...policy };
}
