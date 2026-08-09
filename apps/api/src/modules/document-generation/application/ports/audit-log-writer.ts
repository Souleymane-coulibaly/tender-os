export type DocumentGenerationAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (table partagée) avec `actorType: "USER"` — même convention par-module-
 *  port déjà établie (`tenders`, `client-portfolio`, `chat`, `export`...), jamais un port partagé
 *  entre modules. */
export interface AuditLogWriter {
  record(entry: DocumentGenerationAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("DOCUMENT_GENERATION_AUDIT_LOG_WRITER");
