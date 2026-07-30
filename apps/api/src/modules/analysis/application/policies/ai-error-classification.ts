import {
  AiProviderUnavailableError,
  AiRateLimitedError,
  AiTimeoutError,
} from "../../domain/errors";

/**
 * Classification des erreurs provider retryables (mission §"Timeout et retry" — "erreurs
 * retryables"/"erreurs non retryables") — utilisée UNIQUEMENT par la boucle de retry interne d'un
 * seul appel provider (`ProcessAnalysisJobUseCase`, à l'intérieur d'une réservation déjà acquise).
 * Ne doit jamais dupliquer une analyse : la boucle reste bornée à la même réservation
 * (`attemptCount` inchangé), voir `AnalysisAttempt.retryCount`.
 *
 * Retryable : timeout, rate limit, indisponibilité temporaire du provider (erreur serveur/réseau).
 * Non retryable : authentification, réponse invalide, échec de validation de schéma, provider non
 * configuré — aucun retry ne peut corriger ces causes.
 */
export function isRetryableAiError(error: unknown): boolean {
  return error instanceof AiTimeoutError || error instanceof AiRateLimitedError || error instanceof AiProviderUnavailableError;
}
