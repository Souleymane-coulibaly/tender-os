/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 — port dédié à l'unique besoin d'atomicité
 * cross-module de ce module : `RecordTenderSubmissionUseCase` l'utilise pour envelopper la
 * consommation d'un crédit AO/Pass (`ConsumeAoCreditUseCase`, module `billing`) et l'écriture du
 * `TenderSubmission` dans UNE SEULE transaction Postgres — un seul COMMIT, rollback total (y compris
 * la Submission) si le crédit est insuffisant ou si une consommation concurrente gagne la course.
 * Copie exacte, volontairement répétée (pas un mécanisme partagé), du port de même nom dans
 * `tenders`/`opportunity`/`ai-suggestion-bridge`/`workspace` — voir leur commentaire pour la
 * justification complète du motif `TransactionalContext`.
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("SUBMISSION_ATOMIC_TRANSACTION_RUNNER");
