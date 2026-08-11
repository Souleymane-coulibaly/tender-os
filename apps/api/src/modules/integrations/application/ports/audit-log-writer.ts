export type IntegrationAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM" | "API_KEY";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Mission §62 — trace ApiKeyCreated/Revoked, WebhookCreated/Updated/Disabled/Deleted/TestSent/
 *  DeliveryRetried. Mission §34/§62 : jamais un secret (API key brute, webhook secret) dans
 *  `metadata`. */
export interface AuditLogWriter {
  record(entry: IntegrationAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("INTEGRATIONS_AUDIT_LOG_WRITER");
