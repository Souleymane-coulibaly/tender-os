/** Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de même
 *  nom dans `pricing-schedule`/`technical-memo`/`chat`/`workspace`/`document-generation`. */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("RESPONSE_PACKAGE_ATOMIC_TRANSACTION_RUNNER");
