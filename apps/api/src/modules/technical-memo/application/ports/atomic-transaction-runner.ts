/** Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de même
 *  nom dans `chat`/`workspace`/`document-generation` — enveloppe le flux de mutation complet
 *  (génération + révision + citations + audit) dans UNE SEULE transaction Postgres. */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("TECHNICAL_MEMO_ATOMIC_TRANSACTION_RUNNER");
