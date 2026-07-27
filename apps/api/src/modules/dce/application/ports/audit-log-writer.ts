export type DceAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — même motif que Tenders/Documents :
 *  chaque module possède son propre port + adaptateur Prisma, aucun bus d'événements réel. */
export interface AuditLogWriter {
  record(entry: DceAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
