export type AuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/**
 * Traçabilité des actions sensibles (bible/03-domain/business-rules.md BR-GEN-002) —
 * écriture uniquement, append-only (docs/04-architecture/DATABASE_DESIGN.md §21.1).
 * Ne journalise jamais de secret ni de jeton (consigne de mission).
 */
export interface AuditLogWriter {
  record(entry: AuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
