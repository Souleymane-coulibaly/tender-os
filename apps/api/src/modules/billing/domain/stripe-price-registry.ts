import { BillingInterval } from "./billing-interval";
import { StripePriceNotConfiguredError } from "./errors";
import { PlanTier, type SubscriptionPlanTier } from "./plan-tier";

/**
 * V2 Sprint 22 (billing, étape 22C) — mission : "le backend résout les Price ID depuis le
 * plan+intervalle choisi, le frontend n'envoie JAMAIS un montant/devise/Price ID directement"
 * (anti price-tampering). 7 Price Stripe au total : 3 paliers × 2 intervalles (récurrents) + 1
 * Pass (paiement unique). Sourcés depuis l'environnement (jamais en dur dans le code, contrairement
 * au reste du catalogue `PLAN_CATALOG` — un Price ID est un identifiant d'infrastructure Stripe
 * propre à chaque environnement Test/Live, pas une donnée métier stable). Une variable manquante ne
 * fait jamais échouer le DÉMARRAGE (même discipline que `METRICS_TOKEN`, Sprint 21) — seule une
 * tentative réelle de résolution pour CE couple plan/intervalle échoue, explicitement.
 */
const SUBSCRIPTION_PRICE_ENV_VAR: Record<SubscriptionPlanTier, Record<BillingInterval, string>> = {
  [PlanTier.Starter]: { [BillingInterval.Monthly]: "STRIPE_PRICE_STARTER_MONTHLY", [BillingInterval.Yearly]: "STRIPE_PRICE_STARTER_YEARLY" },
  [PlanTier.Business]: { [BillingInterval.Monthly]: "STRIPE_PRICE_BUSINESS_MONTHLY", [BillingInterval.Yearly]: "STRIPE_PRICE_BUSINESS_YEARLY" },
  [PlanTier.Enterprise]: { [BillingInterval.Monthly]: "STRIPE_PRICE_ENTERPRISE_MONTHLY", [BillingInterval.Yearly]: "STRIPE_PRICE_ENTERPRISE_YEARLY" },
};

const PASS_PRICE_ENV_VAR = "STRIPE_PRICE_PASS_ONE_TIME";

export function resolveStripeSubscriptionPriceId(planTier: SubscriptionPlanTier, billingInterval: BillingInterval): string {
  const envVar = SUBSCRIPTION_PRICE_ENV_VAR[planTier][billingInterval];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new StripePriceNotConfiguredError(`${planTier}/${billingInterval}`, envVar);
  }
  return priceId;
}

export function resolveStripePassPriceId(): string {
  const priceId = process.env[PASS_PRICE_ENV_VAR];
  if (!priceId) {
    throw new StripePriceNotConfiguredError("PASS", PASS_PRICE_ENV_VAR);
  }
  return priceId;
}

/** Direction inverse — un événement webhook Stripe (invoice, subscription) ne porte que des Price
 *  ID, jamais un `planTier`/`billingInterval` TenderOS directement : indispensable pour retrouver
 *  QUEL palier/intervalle a réellement été payé, jamais fait confiance à une métadonnée cliente. */
export function resolvePlanFromStripePriceId(priceId: string): { planTier: SubscriptionPlanTier; billingInterval: BillingInterval } | null {
  for (const planTier of Object.keys(SUBSCRIPTION_PRICE_ENV_VAR) as SubscriptionPlanTier[]) {
    for (const billingInterval of Object.values(BillingInterval)) {
      const envVar = SUBSCRIPTION_PRICE_ENV_VAR[planTier][billingInterval];
      if (process.env[envVar] === priceId) {
        return { planTier, billingInterval };
      }
    }
  }
  return null;
}
