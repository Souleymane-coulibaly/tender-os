export type BillingAuditLogEntry = Readonly<{
  organizationId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown> | undefined;
}>;

/** Mission §68 — vocabulaire d'actions requis pour ce module : PassPurchased, PassConsumed,
 *  PlanAssigned, PlanChanged, BillingIntervalChanged, SubscriptionCanceled (AoCreditsGranted/
 *  AoCreditsConsumed/AoCreditsAdjusted/EntitlementOverrideChanged/SubscriptionChanged appartiennent
 *  respectivement à 22B/22D). Même motif que
 *  `opportunity/application/ports/audit-log-writer.ts` : l'implémentation Prisma rejoint la
 *  transaction ambiante via `PrismaService.currentClient()`, jamais de paramètre `tx` explicite. */
export interface AuditLogWriter {
  record(entry: BillingAuditLogEntry): Promise<void>;
}

export const AUDIT_LOG_WRITER = Symbol("BILLING_AUDIT_LOG_WRITER");
