/** Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de même
 *  nom dans `technical-memo`/`chat`/`workspace`/`document-generation` — enveloppe un flux de
 *  mutation complet (ex : validation de version + audit, ou génération finale + artefact + audit)
 *  dans UNE SEULE transaction Postgres. */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("PRICING_SCHEDULE_ATOMIC_TRANSACTION_RUNNER");
