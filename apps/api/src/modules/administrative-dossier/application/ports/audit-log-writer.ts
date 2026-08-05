export type AdministrativeDossierAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` — même motif que chaque autre module (un port + un adaptateur Prisma
 *  propre à ce module, mission §28). Jamais un secret/token, jamais un document binaire, jamais le
 *  contenu administratif sensible complet en `metadata`. */
export interface AuditLogWriter {
  record(entry: AdministrativeDossierAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("ADMINISTRATIVE_DOSSIER_AUDIT_LOG_WRITER");
