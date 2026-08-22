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

/** Correction Sprint 4.2 §"Validation déterministe de provenance" — une réponse peut respecter le
 *  schéma Zod (structurellement valide) tout en affirmant une provenance fabriquée : un
 *  `documentId` hors du corpus consolidé, un `chunkSequence` inexistant, une `citation` introuvable
 *  dans le chunk cité, ou un `pageStart`/`pageEnd`/`sheetName`/`sectionTitle` qui contredit le
 *  chunk réellement connu. Un score de confiance déclaré par le modèle ne suffit jamais à lui seul
 *  (mission §"un score de confiance ne doit jamais être utilisé seul") — cette erreur est le
 *  résultat de la vérification déterministe correspondante, distincte d'une erreur de forme JSON
 *  (`AiSchemaValidationFailedError`), jamais persistée, jamais retryée automatiquement. */
export class AiProvenanceValidationFailedError extends DomainError {
  readonly code = "AI_PROVENANCE_VALIDATION_FAILED";
  constructor(input: { reason: string }) {
    super(`AI-reported provenance failed deterministic validation: ${input.reason}.`);
  }
}

/** Mission Sprint 4.2 §"Consolidation Tender" — une consolidation ne doit jamais être envoyée au
 *  provider IA sans au moins une analyse documentaire réussie à consolider (jamais demander à
 *  l'IA d'halluciner une synthèse à partir de rien). Traité comme un échec de job normal
 *  (récupérable par retry une fois au moins un document analysé avec succès). */
export class NoDocumentAnalysesAvailableError extends DomainError {
  readonly code = "NO_DOCUMENT_ANALYSES_AVAILABLE";
  constructor() {
    super("No successfully analyzed document is available yet for this tender's consolidation.");
  }
}

/** Mission Sprint 4.2 §"GET .../analysis" — aucune consolidation Tender n'a encore jamais réussi
 *  pour ce tender (aucune `TenderAnalysisSummary` persistée) — jamais confondu avec
 *  `AnalysisNotFoundError` (job introuvable), un job peut très bien exister sans avoir encore
 *  produit de résultat consultable. */
export class TenderBusinessAnalysisNotFoundError extends DomainError {
  readonly code = "TENDER_BUSINESS_ANALYSIS_NOT_FOUND";
  constructor() {
    super("No tender business analysis is available yet for this tender.");
  }
}

/** Mission Sprint 4.2 §"Phase 2 sans acteur HTTP vivant" — un `AnalysisJob` ne devrait jamais
 *  atteindre la Phase 2 sans `triggeredByRole` (toujours renseigné à la création/au retry) ; si
 *  c'est le cas (donnée historique/bug), on refuse explicitement plutôt que de fabriquer un rôle. */
export class AnalysisJobMissingTriggeredByRoleError extends DomainError {
  readonly code = "ANALYSIS_JOB_MISSING_TRIGGERED_BY_ROLE";
  constructor() {
    super("Analysis job is missing the triggeredByRole captured at creation/retry time.");
  }
}

/** Checkpoint TENDEROS-2.1-P2.3-E4.1 — `AiModelRouter` est désormais la SEULE autorité de
 *  sélection du modèle, jamais un repli silencieux (mission §17). Ne devrait jamais survenir en
 *  production réelle (`AiRoutingModule` est câblé globalement) — signale un problème de
 *  configuration/déploiement, jamais une cause métier normale. */
export class AiModelRouterUnavailableError extends DomainError {
  readonly code = "AI_MODEL_ROUTER_UNAVAILABLE";
  constructor() {
    super("The AI model router is not available. Contact support.");
  }
}
