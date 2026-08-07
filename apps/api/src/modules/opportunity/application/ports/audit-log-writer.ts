export type OpportunityAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Écrit dans `audit_logs` (BR-GEN-002) avec `actorType: "USER"` — mécanisme canonique déjà établi.
 *  L'implémentation Prisma consulte `PrismaService.currentClient()` (V2 Sprint 4 round 4) : rejoint
 *  automatiquement la transaction ambiante active (ex. `PromoteOpportunityToTenderUseCase`) sans
 *  qu'aucun paramètre `tx` explicite ne soit nécessaire ici. */
export interface AuditLogWriter {
  record(entry: OpportunityAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("AUDIT_LOG_WRITER");
