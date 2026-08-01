export type PricingAuditLogEntry = Readonly<{
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
 *  propre à ce module). Jamais un montant final calculé côté frontend, jamais une hypothèse
 *  sensible complète en `metadata` (mission §"Observabilité" — champs utiles uniquement). */
export interface AuditLogWriter {
  record(entry: PricingAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("PRICING_AUDIT_LOG_WRITER");
