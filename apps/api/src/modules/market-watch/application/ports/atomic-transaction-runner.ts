/** Copie exacte, volontairement répétée (pas un mécanisme partagé), du port de même nom dans
 *  `opportunity`/`response-package`/etc. — voir leur commentaire pour la justification complète du
 *  motif `TransactionalContext`. Utilisé ici pour envelopper la création/mise à jour d'un
 *  `ExternalTender` (ou d'un `SavedSearchMatch`) et son `OutboxEvent` dans la même transaction
 *  Postgres (mission §91 "mutation métier + OutboxEvent dans la même transaction", même motif que
 *  Sprint 16) — jamais une transaction unique pour tout un cycle de synchronisation (mission
 *  §82/§83, éviter une transaction longue sur tout un batch).
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("MARKET_WATCH_ATOMIC_TRANSACTION_RUNNER");
