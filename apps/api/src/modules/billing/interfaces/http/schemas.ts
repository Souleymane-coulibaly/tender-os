import { z } from "zod";
import { BillingInterval } from "../../domain/billing-interval";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import { SUBSCRIPTION_PLAN_TIERS } from "../../domain/plan-tier";
import { QuotaType, UNLIMITED } from "../../domain/quota-type";

export const OrganizationIdParamSchema = z.string().uuid();
export const OverrideIdParamSchema = z.string().uuid();

const QuotaLimitSchema = z.union([z.number().int().min(0), z.literal(UNLIMITED)]);

/** Mission §31/§39 — exactement une cible (feature XOR quota), reason obligatoire, `.strict()`
 *  (mission §46 anti mass-assignment : `plan`/`entitlement`/`override`/`isPlatformAdmin` envoyés
 *  dans le body ne sont jamais lus, `.strict()` les rejette explicitement en 400). */
export const CreateEntitlementOverrideBodySchema = z
  .object({
    feature: z.enum(Object.values(EntitlementFeature) as [string, ...string[]]).optional(),
    featureEnabled: z.boolean().optional(),
    quota: z.enum(Object.values(QuotaType) as [string, ...string[]]).optional(),
    quotaLimit: QuotaLimitSchema.optional(),
    reason: z.string().trim().min(1).max(500),
    expiresAt: z.coerce.date().optional(),
  })
  .strict()
  .refine((data) => (data.feature !== undefined) !== (data.quota !== undefined), { message: "Exactly one of feature or quota must be provided." })
  .refine((data) => data.feature === undefined || data.featureEnabled !== undefined, { message: "featureEnabled is required when feature is provided." })
  .refine((data) => data.quota === undefined || data.quotaLimit !== undefined, { message: "quotaLimit is required when quota is provided." });

export type CreateEntitlementOverrideBody = z.infer<typeof CreateEntitlementOverrideBodySchema>;

export const ListEntitlementOverridesQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  })
  .strict();

export type ListEntitlementOverridesQuery = z.infer<typeof ListEntitlementOverridesQuerySchema>;

/** V2 Sprint 22 (billing, étape 22B) — mission §31 "+1/-1" : `amount` signé, jamais un solde final
 *  imposé directement. `.strict()` — même motif anti mass-assignment que les overrides. */
export const AdjustAoCreditsBodySchema = z
  .object({
    amount: z.number().int().refine((value) => value !== 0, { message: "amount must not be zero" }),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type AdjustAoCreditsBody = z.infer<typeof AdjustAoCreditsBodySchema>;

export const ReverseAoCreditConsumptionBodySchema = z
  .object({
    tenderId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type ReverseAoCreditConsumptionBody = z.infer<typeof ReverseAoCreditConsumptionBodySchema>;

export const ListAoCreditLedgerQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().default(25),
  })
  .strict();

export type ListAoCreditLedgerQuery = z.infer<typeof ListAoCreditLedgerQuerySchema>;

/** V2 Sprint 22 (billing, étape 22C) — mission anti price-tampering : uniquement le CHOIX métier
 *  (Pass, ou palier+intervalle), jamais un prix/Price ID/devise envoyé par le client. `.strict()`
 *  — même motif anti mass-assignment que le reste du module. Correctif audit Codex P1-03 : jamais
 *  de `successUrl`/`cancelUrl` acceptés ici (open redirect) — toujours résolues côté serveur, voir
 *  `application/services/app-return-urls.ts`. */
export const CreateCheckoutSessionBodySchema = z
  .object({
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("PASS") }).strict(),
      z
        .object({
          kind: z.literal("SUBSCRIPTION"),
          planTier: z.enum(SUBSCRIPTION_PLAN_TIERS as unknown as [string, ...string[]]),
          billingInterval: z.enum(Object.values(BillingInterval) as [string, ...string[]]),
        })
        .strict(),
    ]),
    // V2 Sprint 24 (onboarding) — seule valeur acceptée en plus de l'absence du champ ; jamais une
    // URL, toujours résolue côté serveur (voir appBillingReturnUrls).
    returnTarget: z.literal("onboarding").optional(),
  })
  .strict();

export type CreateCheckoutSessionBody = z.infer<typeof CreateCheckoutSessionBodySchema>;

/** Changement de forfait d'un abonnement existant — même discipline anti price-tampering que le
 *  checkout : un palier et une périodicité, jamais un prix, un Price ID ni une URL. */
export const CreatePlanChangeSessionBodySchema = z
  .object({
    planTier: z.enum(SUBSCRIPTION_PLAN_TIERS as unknown as [string, ...string[]]),
    billingInterval: z.enum(Object.values(BillingInterval) as [string, ...string[]]),
  })
  .strict();

export type CreatePlanChangeSessionBody = z.infer<typeof CreatePlanChangeSessionBodySchema>;
