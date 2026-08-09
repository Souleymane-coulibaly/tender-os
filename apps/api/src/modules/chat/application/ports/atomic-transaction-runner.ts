/** Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de même
 *  nom dans `workspace`/`opportunity`/`ai-suggestion-bridge` — enveloppe le flux de mutation complet
 *  (message + citations + audit + Outbox) dans UNE SEULE transaction Postgres. */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("CHAT_ATOMIC_TRANSACTION_RUNNER");
