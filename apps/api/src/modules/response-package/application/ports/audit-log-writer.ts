export type ResponsePackageAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — mission §96 : jamais le contenu
 *  complet d'un fichier/manifest dans une entrée d'audit, uniquement des identifiants/métadonnées. */
export interface AuditLogWriter {
  record(entry: ResponsePackageAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("RESPONSE_PACKAGE_AUDIT_LOG_WRITER");
