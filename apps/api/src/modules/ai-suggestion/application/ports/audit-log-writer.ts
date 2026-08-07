import type { PrismaTx } from "./ai-suggestion.repository";

export type AiSuggestionAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (BR-GEN-002) avec `actorType: "USER"` — même mécanisme canonique que
 *  chaque autre module (jamais un second système d'audit). V2 Sprint 4 §21 : historise création/
 *  acceptation/modification/rejet d'une suggestion IA.
 *
 *  V2 Sprint 4 (audit Codex P1-001, round 3) — `tx`, si fourni, fait entrer cette écriture dans
 *  la transaction Postgres appelante (voir `AiSuggestionRepository.transitionFromPending`'s
 *  `onSuccessTx`) plutôt que d'ouvrir sa propre connexion implicite. */
export interface AuditLogWriter {
  record(entry: AiSuggestionAuditLogEntry, tx?: PrismaTx): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
