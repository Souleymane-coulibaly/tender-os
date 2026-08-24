import { z } from "zod";
import { BillingInterval, PlanSource, SUBSCRIPTION_PLAN_TIERS } from "../../../billing";

export const OrganizationIdParamSchema = z.string().uuid();

/** Même pagination bornée que le reste du module `billing` (`ListAoCreditLedgerQuerySchema`). */
export const ListPassPurchasesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  })
  .strict();

export type ListPassPurchasesQuery = z.infer<typeof ListPassPurchasesQuerySchema>;

/** Checkpoint TENDEROS-2.1-P2.3-E9 — même pagination bornée, réservée à `GET /billing/ao-credits/ledger`. */
export const ListAoCreditLedgerQuerySchema = ListPassPurchasesQuerySchema;

export type ListAoCreditLedgerQuery = z.infer<typeof ListAoCreditLedgerQuerySchema>;

/** Mission §49 — assignation Platform Admin d'un abonnement MANUAL/GRANTED (pilote/démo). `STRIPE`
 *  n'est JAMAIS un `source` acceptable ici : réservé exclusivement au webhook Stripe. `.strict()`
 *  — anti mass-assignment, même motif que le reste du module `billing`. */
export const AssignManualSubscriptionBodySchema = z
  .object({
    planTier: z.enum(SUBSCRIPTION_PLAN_TIERS as unknown as [string, ...string[]]),
    billingInterval: z.enum(Object.values(BillingInterval) as [string, ...string[]]),
    source: z.enum([PlanSource.Manual, PlanSource.Granted]),
  })
  .strict();

export type AssignManualSubscriptionBody = z.infer<typeof AssignManualSubscriptionBodySchema>;
