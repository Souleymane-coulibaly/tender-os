export type ConnectorAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Mission §77 — ConnectionCreated/Reauthorized/Disconnected, DocumentImported/Exported,
 *  SyncConfigured/Completed/Failed, CalendarEventCreated. Mission §60/§61/§77 "ne jamais logger les
 *  tokens" : `metadata` ne doit JAMAIS contenir un access/refresh token, même chiffré. */
export interface AuditLogWriter {
  record(entry: ConnectorAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("CONNECTORS_AUDIT_LOG_WRITER");
