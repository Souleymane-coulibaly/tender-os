export type MarketWatchAuditLogEntry = Readonly<{
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
  record(entry: MarketWatchAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("MARKET_WATCH_AUDIT_LOG_WRITER");
