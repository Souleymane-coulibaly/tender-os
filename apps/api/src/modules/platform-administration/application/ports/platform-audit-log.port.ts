export type PlatformAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

export type PlatformAuditLogRecord = Readonly<{
  id: string;
  organizationId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: string;
  createdAt: string;
}>;

export type PlatformAuditLogPage = Readonly<{
  items: PlatformAuditLogRecord[];
  nextCursor: string | null;
}>;

/**
 * Écrit dans `audit_logs` avec `actorType: "PLATFORM_ADMIN"` pour distinguer les actions
 * administratives plateforme des actions tenant (BR-GEN-002 — traçabilité).
 */
export interface PlatformAuditLogWriter {
  record(entry: PlatformAuditLogEntry): Promise<void>;
}

/**
 * Lecture cross-tenant de `audit_logs` — réservée à Platform Administration ; aucun autre
 * module ne doit lire cette table à travers les organisations.
 */
export interface PlatformAuditLogReader {
  list(input: { cursor?: string | undefined; limit: number }): Promise<PlatformAuditLogPage>;
}

export const PLATFORM_AUDIT_LOG_WRITER = Symbol("PLATFORM_AUDIT_LOG_WRITER");
export const PLATFORM_AUDIT_LOG_READER = Symbol("PLATFORM_AUDIT_LOG_READER");
