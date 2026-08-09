import { AiProviderUnavailableError, AiRateLimitedError, AiTimeoutError } from "../../../analysis";

/** Puisque Chat réutilise TEL QUEL le port/adaptateur `AIProvider` d'Analysis (même motif que
 *  Generation, décision A5), ce sont les classes d'erreur d'Analysis qui sont réellement levées par
 *  `.complete()` — même liste de retryabilité que `generation/application/policies/ai-error-
 *  classification.ts`. */
export function isRetryableAiError(error: unknown): boolean {
  return error instanceof AiTimeoutError || error instanceof AiRateLimitedError || error instanceof AiProviderUnavailableError;
}
