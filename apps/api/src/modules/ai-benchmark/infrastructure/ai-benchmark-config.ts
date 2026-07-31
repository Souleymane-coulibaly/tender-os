export type AiBenchmarkConfig = Readonly<{
  /** Ceiling par défaut si aucun n'est fourni au lancement (mission §"coût maximal estimé") —
   *  jamais bloquant au démarrage de l'application : une valeur absente retombe sur ce défaut. */
  defaultCostCeilingAmount: string;
  costCeilingCurrency: string;
  /** Bornes dures indépendantes des valeurs demandées par l'utilisateur (mission §"prévoir une
   *  limite configurable" — nombre de modèles/cas/répétitions/concurrence). */
  maxModelsPerRun: number;
  maxConcurrency: number;
  /** Estimation grossière (mission §"L'estimation ne doit pas être présentée comme exacte") —
   *  utilisée uniquement pour le calcul de coût PRÉVISIONNEL avant lancement, jamais pour le coût
   *  réel (toujours recalculé à partir des tokens effectivement facturés après exécution). */
  estimatedInputTokensPerCase: number;
  estimatedOutputTokensPerCase: number;
  caseTimeoutMs: number;
  maxRawOutputLength: number;
  /** Audit Codex P1-3 — un run RUNNING dont `updatedAt` n'a plus progressé depuis ce délai est
   *  considéré "stale" (crash/redéploiement présumé) par `RecoverStaleBenchmarkRunsUseCase`. */
  staleRunTimeoutMs: number;
  maxStaleRecoveryAttempts: number;
}>;

/** Mission §"Configuration" — même discipline que `analysis-config.ts` : aucune variable
 *  obligatoire, jamais un `NestFactory.create(...)` qui échoue faute de configuration IA. */
export function loadAiBenchmarkConfig(): AiBenchmarkConfig {
  return {
    defaultCostCeilingAmount: process.env.AI_BENCHMARK_DEFAULT_COST_CEILING ?? "50",
    costCeilingCurrency: process.env.AI_BENCHMARK_COST_CEILING_CURRENCY ?? "USD",
    maxModelsPerRun: Number(process.env.AI_BENCHMARK_MAX_MODELS_PER_RUN ?? 10),
    maxConcurrency: Number(process.env.AI_BENCHMARK_MAX_CONCURRENCY ?? 5),
    estimatedInputTokensPerCase: Number(process.env.AI_BENCHMARK_ESTIMATED_INPUT_TOKENS ?? 1000),
    estimatedOutputTokensPerCase: Number(process.env.AI_BENCHMARK_ESTIMATED_OUTPUT_TOKENS ?? 500),
    caseTimeoutMs: Number(process.env.AI_BENCHMARK_CASE_TIMEOUT_MS ?? 30000),
    maxRawOutputLength: Number(process.env.AI_BENCHMARK_MAX_RAW_OUTPUT_LENGTH ?? 5000),
    staleRunTimeoutMs: Number(process.env.AI_BENCHMARK_STALE_RUN_TIMEOUT_MS ?? 15 * 60 * 1000),
    maxStaleRecoveryAttempts: Number(process.env.AI_BENCHMARK_MAX_STALE_RECOVERY_ATTEMPTS ?? 3),
  };
}

export const AI_BENCHMARK_CONFIG = Symbol("AI_BENCHMARK_CONFIG");
