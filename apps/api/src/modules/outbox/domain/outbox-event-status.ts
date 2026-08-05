/**
 * skills/platform-foundation/DATABASE_PATTERNS.md §38 — 5 statuts, VarChar + CHECK (migration),
 * jamais un enum PostgreSQL natif.
 */
export const OutboxEventStatus = {
  Pending: "PENDING",
  Processing: "PROCESSING",
  Published: "PUBLISHED",
  Failed: "FAILED",
  DeadLetter: "DEAD_LETTER",
} as const;

export type OutboxEventStatus = (typeof OutboxEventStatus)[keyof typeof OutboxEventStatus];

/** Après combien de tentatives un événement bascule en DEAD_LETTER — non prescrit par
 *  DATABASE_PATTERNS.md §38-40 (seuil laissé à l'implémentation), fixé ici explicitement. */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** Backoff exponentiel en secondes, plafonné à 1h — formule non prescrite par la documentation,
 *  décision d'implémentation documentée ici. */
export function computeOutboxBackoffSeconds(attemptCount: number): number {
  const base = 30;
  const capped = Math.min(base * 2 ** Math.max(attemptCount - 1, 0), 3600);
  return capped;
}
