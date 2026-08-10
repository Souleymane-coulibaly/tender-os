export type PricingScheduleAuditLogEntry = Readonly<{
  organizationId: string;
  actorType: "USER" | "SYSTEM";
  actorId?: string | undefined;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (mécanisme canonique déjà établi) — mission §"AuditLog" : jamais le
 *  contenu complet d'un classeur dans une entrée d'audit, uniquement des identifiants/métadonnées. */
export interface AuditLogWriter {
  record(entry: PricingScheduleAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("PRICING_SCHEDULE_AUDIT_LOG_WRITER");
