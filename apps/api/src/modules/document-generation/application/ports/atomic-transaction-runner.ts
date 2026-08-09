/** Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de même
 *  nom dans `chat`/`workspace`/`opportunity` — enveloppe le flux de mutation complet (génération +
 *  artefact + audit + Outbox) dans UNE SEULE transaction Postgres. */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("DOCUMENT_GENERATION_ATOMIC_TRANSACTION_RUNNER");
