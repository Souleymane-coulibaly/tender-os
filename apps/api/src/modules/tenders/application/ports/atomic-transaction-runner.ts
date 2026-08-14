/**
 * V2 Sprint 22 (billing, étape 22B) — port dédié à l'unique besoin d'atomicité cross-module de ce
 * module : `CreateTenderUseCase` l'utilise pour envelopper la création du Tender et la
 * consommation d'un crédit AO (`ConsumeAoCreditUseCase`, module `billing`) dans UNE SEULE
 * transaction Postgres — un seul COMMIT, rollback total (y compris le Tender fraîchement créé) si
 * le crédit AO est insuffisant. Copie exacte, volontairement répétée (pas un mécanisme partagé),
 * du port de même nom dans `opportunity`/`ai-suggestion-bridge`/`workspace` — voir leur commentaire
 * pour la justification complète du motif `TransactionalContext`.
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("TENDERS_ATOMIC_TRANSACTION_RUNNER");
