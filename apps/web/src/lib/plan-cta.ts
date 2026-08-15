import type { BillingInterval, PlanTier } from "./billing-types";

/**
 * V2 Sprint 23 (landing) — mission §24 "Ne pas créer de route onboarding vide trompeuse. Sinon
 * créer un helper centralisé permettant de changer facilement la destination au Sprint suivant."
 * V2 Sprint 24 — l'Onboarding existe désormais : chaque CTA Pricing route vers `/onboarding`, le
 * choix de plan/facturation/offre conservé dans la query string (jamais perdu, mission §25 "choix
 * Pass conservé"). "conseil" n'a pas d'offre en libre-service — reste dirigé vers `/contact`
 * (aucun Checkout Stripe déclenché depuis un visiteur anonyme sans organisation).
 */
export function getPlanCtaHref(plan: Lowercase<PlanTier> | "conseil", billing?: Lowercase<BillingInterval>): string {
  if (plan === "conseil") {
    return "/contact?plan=conseil";
  }

  const params = plan === "pass" ? new URLSearchParams({ offer: "pass" }) : new URLSearchParams({ plan: plan.toUpperCase() });
  if (billing && plan !== "pass") params.set("billing", billing.toUpperCase());
  return `/onboarding?${params.toString()}`;
}
