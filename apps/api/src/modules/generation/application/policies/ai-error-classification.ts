import { AiProviderUnavailableError, AiRateLimitedError, AiTimeoutError } from "../../../analysis";

/** Puisque Generation réutilise TEL QUEL le port/adaptateur `AIProvider` d'Analysis (décision A5,
 *  jamais un second chemin d'appel provider), ce sont les classes d'erreur d'Analysis qui sont
 *  réellement levées par `.complete()` — même liste de retryabilité que
 *  `analysis/application/policies/ai-error-classification.ts`. */
export function isRetryableAiError(error: unknown): boolean {
  return error instanceof AiTimeoutError || error instanceof AiRateLimitedError || error instanceof AiProviderUnavailableError;
}
