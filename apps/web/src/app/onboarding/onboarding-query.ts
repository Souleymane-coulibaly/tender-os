import { SUBSCRIPTION_PLAN_TIERS, type BillingInterval, type SubscriptionPlanTier } from "../../lib/billing-types";

/**
 * V2 Sprint 24 (onboarding) — mission : SEULES ces valeurs sont acceptées pour `offer`/`plan`/
 * `billing`, jamais un fail-open (toute autre valeur est traitée comme absente, jamais propagée
 * telle quelle vers un composant ou une redirection). Ces paramètres sont reportés tels quels
 * d'étape en étape (jamais perdus) pour que le choix fait sur la Landing/Tarifs survive tout le
 * wizard.
 */
export type OnboardingQuery = {
  offer?: "pass";
  plan?: SubscriptionPlanTier;
  billing?: BillingInterval;
};

const BILLING_INTERVALS: readonly BillingInterval[] = ["MONTHLY", "YEARLY"];

export function parseOnboardingQuery(params: Record<string, string | string[] | undefined>): OnboardingQuery {
  const offerRaw = firstValue(params.offer)?.toLowerCase();
  const planRaw = firstValue(params.plan)?.toUpperCase();
  const billingRaw = firstValue(params.billing)?.toUpperCase();

  const query: OnboardingQuery = {};
  if (offerRaw === "pass") {
    query.offer = "pass";
  }
  if (planRaw && (SUBSCRIPTION_PLAN_TIERS as readonly string[]).includes(planRaw)) {
    query.plan = planRaw as SubscriptionPlanTier;
  }
  if (billingRaw && BILLING_INTERVALS.includes(billingRaw as BillingInterval)) {
    query.billing = billingRaw as BillingInterval;
  }
  return query;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Sérialise pour report d'étape en étape — jamais un champ non reconnu (voir parseOnboardingQuery). */
export function onboardingQueryString(query: OnboardingQuery): string {
  const params = new URLSearchParams();
  if (query.offer) params.set("offer", query.offer);
  if (query.plan) params.set("plan", query.plan);
  if (query.billing) params.set("billing", query.billing);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}
