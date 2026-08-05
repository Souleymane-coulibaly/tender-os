/** Sprint 9 — copie locale du port d'audit (même motif que chaque autre module : jamais un port
 *  partagé importé profondément). Aucun secret/token/document binaire n'est jamais journalisé
 *  (mission §17). */
export type SubmissionAuditLogEntry = Readonly<{
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
  record(entry: SubmissionAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("SUBMISSION_AUDIT_LOG_WRITER");
