import { DomainError } from "../../../shared-kernel/domain-error";

export class InvalidAnalysisStatusError extends DomainError {
  readonly code = "INVALID_ANALYSIS_STATUS";
  constructor(value: string) {
    super(`"${value}" is not a valid analysis status.`);
  }
}

export class InvalidAnalysisScopeError extends DomainError {
  readonly code = "INVALID_ANALYSIS_SCOPE";
  constructor(value: string) {
    super(`"${value}" is not a valid analysis scope.`);
  }
}

export class InvalidAnalysisStatusTransitionError extends DomainError {
  readonly code = "INVALID_ANALYSIS_STATUS_TRANSITION";
  constructor(input: { from: string; to: string }) {
    super(`Cannot transition analysis from ${input.from} to ${input.to}.`);
  }
}

export class AnalysisPermissionMissingError extends DomainError {
  readonly code = "ANALYSIS_PERMISSION_MISSING";
  constructor(input: { permission: string }) {
    super(`Missing permission: ${input.permission}.`);
  }
}

export class AnalysisNotFoundError extends DomainError {
  readonly code = "ANALYSIS_NOT_FOUND";
  constructor() {
    super("Analysis not found.");
  }
}

/** Le corpus d'entrée (module Extraction) n'est pas encore prêt (statut d'extraction non
 *  SUCCEEDED/PARTIALLY_SUCCEEDED) — jamais démarrer une analyse sur un corpus absent. */
export class AnalysisNotReadyError extends DomainError {
  readonly code = "ANALYSIS_NOT_READY";
  constructor(input: { reason: string }) {
    super(`Analysis input is not ready: ${input.reason}.`);
  }
}

/** Mission §"double déclenchement" — un job non terminal existe déjà pour cette cible. */
export class AnalysisAlreadyRunningError extends DomainError {
  readonly code = "ANALYSIS_ALREADY_RUNNING";
  constructor() {
    super("An analysis is already running for this target.");
  }
}

/** Compare-and-set rejeté à la finalisation (mission §"tentative obsolète") — jamais exposé
 *  directement à l'appelant HTTP (traitement asynchrone), utilisé pour les assertions internes. */
export class AnalysisAttemptStaleError extends DomainError {
  readonly code = "ANALYSIS_ATTEMPT_STALE";
  constructor() {
    super("This analysis attempt is no longer the current reservation.");
  }
}

/** Le contrat applicatif Extraction (`GetDocumentAnalysisInputUseCase`) n'a pas pu fournir de
 *  corpus exploitable (document/DCE/Tender introuvable, chunks absents). */
export class AnalysisInputUnavailableError extends DomainError {
  readonly code = "ANALYSIS_INPUT_UNAVAILABLE";
  constructor(input: { reason: string }) {
    super(`Analysis input is unavailable: ${input.reason}.`);
  }
}

export class AnalysisNotRetryableError extends DomainError {
  readonly code = "ANALYSIS_NOT_RETRYABLE";
  constructor(input: { status: string }) {
    super(`Analysis in status "${input.status}" cannot be retried.`);
  }
}

export class AnalysisNotCancellableError extends DomainError {
  readonly code = "ANALYSIS_NOT_CANCELLABLE";
  constructor(input: { status: string }) {
    super(`Analysis in status "${input.status}" cannot be cancelled.`);
  }
}

export class AnalysisRetryLimitExceededError extends DomainError {
  readonly code = "ANALYSIS_RETRY_LIMIT_EXCEEDED";
  constructor(input: { maxAttempts: number }) {
    super(`Analysis has already been attempted ${input.maxAttempts} time(s); no further retry is allowed.`);
  }
}

// Erreurs normalisées du port AIProvider (mission §"erreurs normalisées") — ne divulguent jamais
// de clé API, de payload complet ni de stack interne, uniquement des grandeurs/raisons déjà sûres.

/** Couvre à la fois "aucun provider configuré" (`AI_PROVIDER`/clé absente) et "provider configuré
 *  mais inconnu du registry" (mission §"refuser un provider inconnu") — un seul code, le
 *  comportement observable par l'appelant est identique dans les deux cas. */
export class AiProviderNotConfiguredError extends DomainError {
  readonly code = "AI_PROVIDER_NOT_CONFIGURED";
  constructor(input: { reason: string }) {
    super(`AI provider is not configured: ${input.reason}.`);
  }
}

export class AiProviderUnavailableError extends DomainError {
  readonly code = "AI_PROVIDER_UNAVAILABLE";
  constructor(input: { reason: string }) {
    super(`AI provider is unavailable: ${input.reason}.`);
  }
}

export class AiAuthenticationFailedError extends DomainError {
  readonly code = "AI_AUTHENTICATION_FAILED";
  constructor() {
    super("AI provider authentication failed.");
  }
}

export class AiRateLimitedError extends DomainError {
  readonly code = "AI_RATE_LIMITED";
  constructor() {
    super("AI provider rate limit exceeded.");
  }
}

export class AiTimeoutError extends DomainError {
  readonly code = "AI_TIMEOUT";
  constructor(input: { timeoutMs: number }) {
    super(`AI provider call exceeded the configured timeout (${input.timeoutMs}ms).`);
  }
}

export class AiInvalidResponseError extends DomainError {
  readonly code = "AI_INVALID_RESPONSE";
  constructor(input: { reason: string }) {
    super(`AI provider returned an invalid response: ${input.reason}.`);
  }
}

export class AiSchemaValidationFailedError extends DomainError {
  readonly code = "AI_SCHEMA_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`AI provider response failed schema validation: ${input.reason}.`);
  }
}
