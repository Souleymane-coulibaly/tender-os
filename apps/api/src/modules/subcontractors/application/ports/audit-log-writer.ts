export type SubcontractorAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

export interface AuditLogWriter {
  record(entry: SubcontractorAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("SUBCONTRACTOR_AUDIT_LOG_WRITER");
