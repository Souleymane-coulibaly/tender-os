import { WEBHOOK_DELIVERY_MAX_ATTEMPTS } from "../enums";

/** Mission §40 — backoff exemple "1 min / 5 min / 30 min / 2h..." repris explicitement (plafonné
 *  à 6h), même motif documenté que `computeOutboxBackoffSeconds` (Sprint 1). */
export function computeWebhookDeliveryBackoffSeconds(attemptCount: number): number {
  const schedule = [60, 300, 1800, 7200, 21600];
  const index = Math.min(Math.max(attemptCount - 1, 0), schedule.length - 1);
  return schedule[index]!;
}

export function hasReachedMaxAttempts(attemptCount: number): boolean {
  return attemptCount >= WEBHOOK_DELIVERY_MAX_ATTEMPTS;
}

/**
 * Mission §41/§105/§108/§109 — policy de retry :
 * - timeout / erreur réseau : retryable ;
 * - 429 : retryable (mission §109) ;
 * - 5xx : retryable (mission §105/§107) ;
 * - autre 4xx (400/401/403/404/410/422...) : PAS de retry indéfini, échec définitif immédiat
 *   (mission §41 "ne pas retry indéfiniment tous les 4xx", §108).
 */
export function isRetryableDeliveryOutcome(input: { httpStatus?: number | undefined; isNetworkOrTimeoutError: boolean }): boolean {
  if (input.isNetworkOrTimeoutError) return true;
  if (input.httpStatus === undefined) return true;
  if (input.httpStatus === 429) return true;
  if (input.httpStatus >= 500) return true;
  return false;
}
