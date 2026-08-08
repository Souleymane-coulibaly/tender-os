/**
 * V2 Sprint 7 (correctif audit Codex P1-02) — les repositories Prisma de ce module (`Task`,
 * `Comment`, `Mention`, `ApprovalRequest`) et les écrivains (`AuditLogWriter`, `TenderActivity`,
 * `OutboxWriter`) rejoignent déjà la transaction ambiante active via `PrismaService.currentClient()`
 * — mais aucun use case n'ouvrait jusqu'ici de transaction, donc chaque étape (sauvegarde métier,
 * AuditLog, TenderActivity, Outbox) committait indépendamment. Un échec après la sauvegarde
 * principale pouvait laisser une tâche/un commentaire/une approbation persistée SANS trace d'audit,
 * sans entrée d'activité ou sans événement Outbox. Ce port enveloppe le flux de mutation complet
 * dans UNE SEULE transaction Postgres — un seul COMMIT, rollback total si n'importe quelle étape
 * échoue. Copie exacte, volontairement répétée (pas un mécanisme partagé inter-module), du port de
 * même nom dans `opportunity`/`ai-suggestion-bridge` — voir leur commentaire pour la justification
 * complète du motif `TransactionalContext`.
 */
export interface AtomicTransactionRunner {
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export const ATOMIC_TRANSACTION_RUNNER = Symbol("WORKSPACE_ATOMIC_TRANSACTION_RUNNER");
