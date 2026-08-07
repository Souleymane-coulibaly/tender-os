/**
 * V2 Sprint 5 — port dédié à l'unique besoin d'atomicité cross-module de ce module :
 * `PromoteOpportunityToTenderUseCase` l'utilise pour envelopper la relecture de la dernière décision
 * (ferme la fenêtre TOCTOU), la création du Tender (`CreateTenderUseCase`, module `tenders`) et la
 * réservation/finalisation (statut Opportunity + audit + Outbox) dans UNE SEULE transaction
 * Postgres — un seul COMMIT, rollback total (y compris le Tender fraîchement créé) si n'importe
 * quelle étape échoue. Copie exacte, volontairement répétée (pas un mécanisme partagé), du port de
 * même nom dans `ai-suggestion-bridge` — voir son commentaire pour la justification complète du
 * motif `TransactionalContext`.
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("OPPORTUNITY_ATOMIC_TRANSACTION_RUNNER");
