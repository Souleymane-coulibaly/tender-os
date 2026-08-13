import { GenerationStatus } from "../../domain/generation-status";
import type { Generation } from "../../domain/generation.aggregate";
import { GenerationNotRetryableError, GenerationRetryLimitExceededError } from "../../domain/errors";

/**
 * Sprint 21 (hardening) — même motif qu'`assertAnalysisIsRetryable` (module Analysis) :
 * `maxRetries` borne le nombre de tentatives SUPPLÉMENTAIRES après la première (donc
 * `1 + maxRetries` réservations au total). Réutilise `GenerationConfig.aiMaxRetries` — même valeur
 * que la boucle de retry interne à un appel provider (`ProcessGenerationUseCase`), jamais un second
 * réglage séparé pour un cas qui reste conceptuellement "combien de tentatives au total".
 */
export function assertGenerationIsRetryable(generation: Generation, maxRetries: number): void {
  if (generation.status !== GenerationStatus.Failed) {
    throw new GenerationNotRetryableError({ status: generation.status });
  }
  if (generation.attemptCount >= 1 + maxRetries) {
    throw new GenerationRetryLimitExceededError({ maxAttempts: 1 + maxRetries });
  }
}
