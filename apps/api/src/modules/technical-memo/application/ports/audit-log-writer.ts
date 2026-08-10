export type TechnicalMemoAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — mission §86 : jamais le contenu
 *  complet d'une section dans une entrée d'audit, uniquement des identifiants/métadonnées. */
export interface AuditLogWriter {
  record(entry: TechnicalMemoAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("TECHNICAL_MEMO_AUDIT_LOG_WRITER");
