import { AiProviderUnavailableError, AiRateLimitedError, AiTimeoutError } from "../../../analysis";

/** Copie exacte du même utilitaire que `chat`/`generation` (réutilisent tous le port `AIProvider`
 *  d'Analysis, mêmes classes d'erreur réellement levées par `.complete()`). */
export function isRetryableAiError(error: unknown): boolean {
  return error instanceof AiTimeoutError || error instanceof AiRateLimitedError || error instanceof AiProviderUnavailableError;
}
