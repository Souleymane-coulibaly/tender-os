export type DocumentAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) avec `actorType: "USER"` — même
 *  motif que les autres modules (aucun bus d'événements réel dans ce dépôt, voir conception §J). */
export interface AuditLogWriter {
  record(entry: DocumentAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
