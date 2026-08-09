export type ChatAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (table partagée) avec `actorType: "USER"` — même convention par-module-
 *  port déjà établie (`tenders`, `client-portfolio`, `workspace`, `knowledge-base`...), jamais un
 *  port partagé entre modules. */
export interface AuditLogWriter {
  record(entry: ChatAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("CHAT_AUDIT_LOG_WRITER");
