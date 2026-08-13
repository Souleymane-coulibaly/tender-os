import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidGenerationTaskTypeError extends DomainError {
  readonly code = "INVALID_GENERATION_TASK_TYPE";
  constructor(value: string) {
    super(`"${value}" is not a known generation task type.`);
  }
}

export class InvalidGenerationOutputModeError extends DomainError {
  readonly code = "INVALID_GENERATION_OUTPUT_MODE";
  constructor(value: string) {
    super(`"${value}" is not a known generation output mode.`);
  }
}

export class InvalidGenerationStatusError extends DomainError {
  readonly code = "INVALID_GENERATION_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a known generation status.`);
  }
}

export class InvalidGenerationStatusTransitionError extends DomainError {
  readonly code = "INVALID_GENERATION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition generation from ${input.from} to ${input.to}.`);
  }
}

export class InvalidPromptVersionStatusTransitionError extends DomainError {
  readonly code = "INVALID_PROMPT_VERSION_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition prompt version from ${input.from} to ${input.to}.`);
  }
}

export class GenerationPermissionMissingError extends DomainError {
  readonly code = "GENERATION_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class GenerationNotFoundError extends DomainError {
  readonly code = "GENERATION_NOT_FOUND";
  constructor() {
    super("Generation not found.");
  }
}

export class GenerationAlreadyRunningError extends DomainError {
  readonly code = "GENERATION_ALREADY_RUNNING";
  constructor() {
    super("A generation for this exact tender/task type/target is already pending or in progress.");
  }
}

export class GenerationNotRetryableError extends DomainError {
  readonly code = "GENERATION_NOT_RETRYABLE";
  constructor(input: { status: string }) {
    super(`Only a FAILED generation can be retried (current status: ${input.status}).`);
  }
}

/** Sprint 21 (hardening) — mission §"pas de retry illimité sur une génération coûteuse", même motif
 *  qu'`AnalysisRetryLimitExceededError`. Sans cette borne, `RetryGenerationUseCase` n'avait
 *  strictement aucune limite : un utilisateur pouvait relancer une génération en échec permanent
 *  indéfiniment, jamais gratuit (chaque tentative est un appel provider réel). */
export class GenerationRetryLimitExceededError extends DomainError {
  readonly code = "GENERATION_RETRY_LIMIT_EXCEEDED";
  constructor(input: { maxAttempts: number }) {
    super(`Generation has already been attempted ${input.maxAttempts} time(s); no further retry is allowed.`);
  }
}

export class GenerationNotCancellableError extends DomainError {
  readonly code = "GENERATION_NOT_CANCELLABLE";
  constructor() {
    super("This generation has already reached a terminal state and cannot be cancelled.");
  }
}

export class GenerationNotEditableError extends DomainError {
  readonly code = "GENERATION_NOT_EDITABLE";
  constructor() {
    super("Only a GENERATED generation can be edited.");
  }
}

export class GenerationNotValidatableError extends DomainError {
  readonly code = "GENERATION_NOT_VALIDATABLE";
  constructor() {
    super("Only a GENERATED generation can be validated.");
  }
}

/** Correctif Sprint 6 (réaudit Codex P1 — "le rejet d'une génération est absent"). */
export class GenerationNotRejectableError extends DomainError {
  readonly code = "GENERATION_NOT_REJECTABLE";
  constructor() {
    super("Only a GENERATED generation can be rejected.");
  }
}

/** Distinct de `GenerationNotRejectableError` (mauvais statut) — ici le statut est correct
 *  (GENERATED) mais la génération a déjà été validée : validation et rejet sont mutuellement
 *  exclusifs, jamais l'un après l'autre. */
export class GenerationAlreadyValidatedError extends DomainError {
  readonly code = "GENERATION_ALREADY_VALIDATED";
  constructor() {
    super("This generation has already been validated and can no longer be rejected.");
  }
}

/** Symétrique de `GenerationAlreadyValidatedError` — empêche de valider une génération déjà
 *  rejetée (voir `Generation.validate()`). */
export class GenerationAlreadyRejectedError extends DomainError {
  readonly code = "GENERATION_ALREADY_REJECTED";
  constructor() {
    super("This generation has already been rejected and can no longer be validated.");
  }
}

/** Distinct de `GenerationNotValidatableError`/`GenerationNotRejectableError` (mauvais statut) —
 *  ici le statut est correct, mais l'acteur n'a qu'un accès par affectation client et cette
 *  génération n'est pas la sienne (voir `generation-validate.policy.ts`/`generation-reject.policy.ts`,
 *  "règle simple" mission §"Validation" — réutilisée telle quelle pour le rejet, réaudit Codex P1,
 *  les deux étant les deux issues possibles d'une même revue). */
export class GenerationNotOwnedByActorError extends DomainError {
  readonly code = "GENERATION_NOT_OWNED_BY_ACTOR";
  constructor() {
    super("You can only validate or reject generations you launched yourself.");
  }
}

export class PromptTemplateNotFoundError extends DomainError {
  readonly code = "PROMPT_TEMPLATE_NOT_FOUND";
  constructor() {
    super("Prompt template not found.");
  }
}

export class DuplicatePromptTemplateError extends DomainError {
  readonly code = "DUPLICATE_PROMPT_TEMPLATE";
  constructor() {
    super("A prompt template for this task type already exists in this organization.");
  }
}

export class PromptTemplateArchivedError extends DomainError {
  readonly code = "PROMPT_TEMPLATE_ARCHIVED";
  constructor() {
    super("This prompt template is archived and can no longer receive new versions.");
  }
}

export class PromptVersionNotFoundError extends DomainError {
  readonly code = "PROMPT_VERSION_NOT_FOUND";
  constructor() {
    super("Prompt version not found.");
  }
}

export class NoActivePromptVersionError extends DomainError {
  readonly code = "NO_ACTIVE_PROMPT_VERSION";
  constructor() {
    super("This task type has no active prompt version yet; ask an administrator to activate one.");
  }
}

/** Même motif que `RoutingPolicyActivationConflictError` (ai-benchmark) — traduit une violation de
 *  l'index unique partiel `prompt_versions_org_template_active_key` (migration) en une erreur
 *  métier explicite, jamais une exception Prisma brute remontée à l'appelant. */
export class PromptVersionActivationConflictError extends DomainError {
  readonly code = "PROMPT_VERSION_ACTIVATION_CONFLICT";
  constructor() {
    super("Another activation for this template is already in progress; retry the activation.");
  }
}

export class PromptVariableMissingError extends DomainError {
  readonly code = "PROMPT_VARIABLE_MISSING";
  constructor(input: { placeholder: string }) {
    super(`The prompt references "{{${input.placeholder}}}", which was not supplied.`);
  }
}

export class GenerationSchemaValidationFailedError extends DomainError {
  readonly code = "GENERATION_SCHEMA_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Generated structured content failed schema validation: ${input.reason}`);
  }
}

export class GenerationCitationValidationFailedError extends DomainError {
  readonly code = "GENERATION_CITATION_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`Generated content cited a source that could not be verified: ${input.reason}`);
  }
}

/** Correctif Sprint 6 (audit Codex P1-1 — "routing dormant") : comportement EXPLICITE quand aucune
 *  RoutingPolicy active n'existe pour le taskType de cette génération — jamais un repli silencieux
 *  sur un modèle codé en dur (`GenerationConfig.aiModel`). La génération échoue avec ce code avant
 *  tout appel provider, sans jamais créer de `RoutingDecision` ; un administrateur doit activer une
 *  RoutingPolicy pour ce taskType (voir `ai-benchmark`, `CreateRoutingPolicyUseCase`). */
export class NoActiveRoutingPolicyError extends DomainError {
  readonly code = "NO_ACTIVE_ROUTING_POLICY";
  constructor() {
    super("No active routing policy for this task type; ask an administrator to activate one before generating.");
  }
}

/** Correctif Sprint 6 (audit Codex P1-2) — une RoutingPolicy active a bien été résolue, mais la
 *  `RoutingDecision` Sprint 5.2 n'a pas pu être persistée durablement (erreur infra, `RoutingPolicy
 *  BridgeModule` non câblé, etc.) : la génération échoue explicitement AVANT tout appel provider —
 *  jamais un appel non traçable. L'erreur détaillée est toujours journalisée en ERROR par
 *  `ProcessGenerationUseCase`, jamais silencieuse. */
export class RoutingDecisionPersistenceFailedError extends DomainError {
  readonly code = "ROUTING_DECISION_PERSISTENCE_FAILED";
  constructor() {
    super("The routing decision for this generation could not be durably recorded; the generation was not attempted.");
  }
}

// Aucune classe d'erreur "provider IA" propre à Generation : puisque le module réutilise TEL QUEL
// `AIProviderRegistry`/`AIProvider` d'Analysis (décision A5, voir rapport final §H), les erreurs
// réellement levées par `.complete()` sont `AiTimeoutError`/`AiRateLimitedError`/etc. d'Analysis,
// réexportées par `analysis/index.ts` — jamais une seconde hiérarchie d'erreurs qui ne
// correspondrait à rien de réellement levé.
