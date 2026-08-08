export type WorkspaceAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (table partagée) avec `actorType: "USER"` — même convention par-module-
 *  port déjà établie (`tenders`, `client-portfolio`, `memberships`, `subcontractors`...), jamais un
 *  port partagé entre modules. */
export interface AuditLogWriter {
  record(entry: WorkspaceAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
