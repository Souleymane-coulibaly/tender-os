/**
 * V2 Sprint 4 (audit Codex P1-001, round 4 — atomicité totale) — port dédié à l'unique besoin
 * d'atomicité cross-module de ce bridge : `ApplyAiSuggestionUseCase` l'utilise pour envelopper
 * réservation + écriture métier cible (Tenders/Buyer) + finalisation (statut AiSuggestion + audit
 * + Outbox) dans UNE SEULE transaction Postgres — un seul COMMIT, rollback total si n'importe
 * quelle étape échoue.
 *
 * Reste une frontière hexagonale propre : la couche application (`ApplyAiSuggestionUseCase`)
 * dépend de ce port, jamais de `PrismaService` directement. L'implémentation infra
 * (`PrismaAtomicTransactionRunner`) ouvre la transaction et établit le contexte transactionnel
 * ambiant (`TransactionalContext`, shared-kernel) consulté automatiquement par les repositories
 * Prisma adaptés (AiSuggestion/Tenders/Buyer/Outbox/leurs AuditLogWriter) — aucune signature
 * publique de use case Tenders n'est modifiée pour faire transiter un `tx` explicitement.
 *
 * Seul point d'entrée de ce mécanisme dans le dépôt : n'est PAS une infra générale imposée à
 * d'autres flux — voir `TransactionalContext` pour la portée exacte.
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("ATOMIC_TRANSACTION_RUNNER");
