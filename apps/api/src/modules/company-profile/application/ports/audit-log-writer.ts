export type CompanyProfileAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` — port propre à ce module (mission §11 "toute action significative doit
 *  être journalisée"), jamais de secret/donnée bancaire complète en `metadata`. */
export interface AuditLogWriter {
  record(entry: CompanyProfileAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("COMPANY_PROFILE_AUDIT_LOG_WRITER");
