import { InvalidPlanTierError } from "./errors";

/**
 * V2 Sprint 22 (billing, étape 22A) — les quatre paliers du catalogue SaaS. CONSEIL est
 * délibérément absent : sur devis, sans quota SaaS automatique (mission §12), jamais représenté
 * comme un `PlanTier` (aucun `EntitlementService.getEffectiveLimit` n'a de sens pour lui). PASS est
 * un `PlanTier` à part entière pour le catalogue/entitlements (mission §3 "Pass = fonctionnalités
 * métier Starter"), mais n'a JAMAIS de ligne `OrganizationSubscription` — voir
 * `organization-subscription.aggregate.ts` (`SubscriptionPlanTier`, qui exclut Pass) et
 * `pass-purchase.aggregate.ts`.
 */
export const PlanTier = {
  Pass: "PASS",
  Starter: "STARTER",
  Business: "BUSINESS",
  Enterprise: "ENTERPRISE",
} as const;

export type PlanTier = (typeof PlanTier)[keyof typeof PlanTier];

/** Paliers valides pour `OrganizationSubscription.planTier` — jamais PASS (mission §5/§20). */
export const SUBSCRIPTION_PLAN_TIERS = [PlanTier.Starter, PlanTier.Business, PlanTier.Enterprise] as const;
export type SubscriptionPlanTier = (typeof SUBSCRIPTION_PLAN_TIERS)[number];

export function isPlanTier(value: string): value is PlanTier {
  return Object.values(PlanTier).includes(value as PlanTier);
}

export function isSubscriptionPlanTier(value: string): value is SubscriptionPlanTier {
  return (SUBSCRIPTION_PLAN_TIERS as readonly string[]).includes(value);
}

export function parseSubscriptionPlanTier(value: string): SubscriptionPlanTier {
  if (!isSubscriptionPlanTier(value)) {
    throw new InvalidPlanTierError(value);
  }
  return value;
}
