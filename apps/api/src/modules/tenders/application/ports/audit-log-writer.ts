export type TenderAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (BR-GEN-002) avec `actorType: "USER"` — mécanisme canonique déjà établi. */
export interface AuditLogWriter {
  record(entry: TenderAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
