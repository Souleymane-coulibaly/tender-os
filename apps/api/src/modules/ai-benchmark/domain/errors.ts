import { DomainError } from "../../../shared-kernel/domain-error";

export class AiModelNotFoundError extends DomainError {
  readonly code = "AI_MODEL_NOT_FOUND";
  constructor() {
    super("AI model not found.");
  }
}

export class DuplicateAiModelError extends DomainError {
  readonly code = "DUPLICATE_AI_MODEL";
  constructor() {
    super("This provider/model combination is already registered.");
  }
}

export class ModelKeyNotAllowedError extends DomainError {
  readonly code = "MODEL_KEY_NOT_ALLOWED";
  constructor(input: { provider: string; modelKey: string }) {
    super(`Model "${input.modelKey}" is not in the allowed catalog for provider "${input.provider}".`);
  }
}

export class AiModelNotEnabledForBenchmarkError extends DomainError {
  readonly code = "AI_MODEL_NOT_ENABLED_FOR_BENCHMARK";
  constructor() {
    super("This AI model is not enabled for benchmark use.");
  }
}

export class AiModelDisabledError extends DomainError {
  readonly code = "AI_MODEL_DISABLED";
  constructor() {
    super("This AI model is disabled.");
  }
}

export class PricingSnapshotOverlapError extends DomainError {
  readonly code = "PRICING_SNAPSHOT_OVERLAP";
  constructor() {
    super("A pricing snapshot for this model is already in effect; close it before adding a new one.");
  }
}

export class PricingSnapshotNotFoundError extends DomainError {
  readonly code = "PRICING_SNAPSHOT_NOT_FOUND";
  constructor() {
    super("No active pricing snapshot for this model.");
  }
}

export class BenchmarkSuiteNotFoundError extends DomainError {
  readonly code = "BENCHMARK_SUITE_NOT_FOUND";
  constructor() {
    super("Benchmark suite not found.");
  }
}

export class BenchmarkSuiteNotDraftError extends DomainError {
  readonly code = "BENCHMARK_SUITE_NOT_DRAFT";
  constructor() {
    super("Cases can only be added to a suite version that is still DRAFT.");
  }
}

export class BenchmarkSuiteEmptyError extends DomainError {
  readonly code = "BENCHMARK_SUITE_EMPTY";
  constructor() {
    super("A benchmark suite must contain at least one case before it can be published or run.");
  }
}

export class BenchmarkRunNotFoundError extends DomainError {
  readonly code = "BENCHMARK_RUN_NOT_FOUND";
  constructor() {
    super("Benchmark run not found.");
  }
}

export class BenchmarkRunNotCancellableError extends DomainError {
  readonly code = "BENCHMARK_RUN_NOT_CANCELLABLE";
  constructor() {
    super("This benchmark run has already reached a terminal state and cannot be cancelled.");
  }
}

export class InvalidBenchmarkRunStatusTransitionError extends DomainError {
  readonly code = "INVALID_BENCHMARK_RUN_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition benchmark run from ${input.from} to ${input.to}.`);
  }
}

export class BenchmarkRunModelNotEligibleError extends DomainError {
  readonly code = "BENCHMARK_RUN_MODEL_NOT_ELIGIBLE";
  constructor(input: { modelId: string }) {
    super(`Model "${input.modelId}" is disabled or not enabled for benchmark use.`);
  }
}

export class InvalidBenchmarkRunParametersError extends DomainError {
  readonly code = "INVALID_BENCHMARK_RUN_PARAMETERS";
  constructor(message: string) {
    super(message);
  }
}

export class BenchmarkCostCeilingExceededError extends DomainError {
  readonly code = "BENCHMARK_COST_CEILING_EXCEEDED";
  constructor(input: { estimated: string; ceiling: string; currency: string }) {
    super(
      `Estimated cost ${input.estimated} ${input.currency} exceeds the configured ceiling ${input.ceiling} ${input.currency}.`,
    );
  }
}

export class BenchmarkRunNotCompletedError extends DomainError {
  readonly code = "BENCHMARK_RUN_NOT_COMPLETED";
  constructor() {
    super("A recommendation can only be generated from a run that has reached SUCCEEDED or PARTIALLY_SUCCEEDED.");
  }
}

export class NoAdmissibleModelError extends DomainError {
  readonly code = "NO_ADMISSIBLE_MODEL";
  constructor() {
    super("Every model in this run was eliminated by a hard threshold; no recommendation can be generated.");
  }
}

export class ModelRecommendationNotFoundError extends DomainError {
  readonly code = "MODEL_RECOMMENDATION_NOT_FOUND";
  constructor() {
    super("Model recommendation not found.");
  }
}

export class ModelRecommendationNotDraftError extends DomainError {
  readonly code = "MODEL_RECOMMENDATION_NOT_DRAFT";
  constructor() {
    super("Only a DRAFT recommendation can be approved or rejected.");
  }
}

export class RoutingPolicyNotFoundError extends DomainError {
  readonly code = "ROUTING_POLICY_NOT_FOUND";
  constructor() {
    super("Routing policy not found.");
  }
}

export class InvalidRoutingPolicyStatusTransitionError extends DomainError {
  readonly code = "INVALID_ROUTING_POLICY_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition routing policy from ${input.from} to ${input.to}.`);
  }
}

export class AiBenchmarkPermissionMissingError extends DomainError {
  readonly code = "AI_BENCHMARK_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

/** Audit Codex P1-1 — levée quand l'activation perd une course de concurrence contre une autre
 *  activation simultanée pour le même (organizationId, promptKey) : traduit une violation de
 *  l'index unique partiel `routing_policies_org_prompt_key_active_key` (migration) en une erreur
 *  métier explicite, jamais une exception Prisma brute remontée à l'appelant. */
export class RoutingPolicyActivationConflictError extends DomainError {
  readonly code = "ROUTING_POLICY_ACTIVATION_CONFLICT";
  constructor() {
    super("Another activation for this task is already in progress; retry the activation.");
  }
}

/** Audit Codex P1-1 — une policy ne peut être activée si son modèle principal ou d'escalade a été
 *  désactivé pour la production entre sa création et son activation. */
export class RoutingPolicyModelNotEligibleError extends DomainError {
  readonly code = "ROUTING_POLICY_MODEL_NOT_ELIGIBLE";
  constructor(input: { modelId: string }) {
    super(`Model "${input.modelId}" is disabled or not enabled for production use and cannot be activated.`);
  }
}

/** Audit Codex P1-3 — un run RUNNING dont le `updatedAt` n'a plus progressé depuis le seuil
 *  configuré (crash/redéploiement présumé) et qui a déjà épuisé ses tentatives de récupération. */
export class BenchmarkRunStaleRecoveryExhaustedError extends DomainError {
  readonly code = "BENCHMARK_RUN_STALE_RECOVERY_EXHAUSTED";
  constructor() {
    super("This benchmark run was stuck RUNNING and exhausted its stale-recovery attempts.");
  }
}
