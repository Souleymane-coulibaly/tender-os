import type { BillingInterval, PlanTier } from "./billing-types";

/**
 * V2 Sprint 23 (landing) — mission §24 "Ne pas créer de route onboarding vide trompeuse. Sinon
 * créer un helper centralisé permettant de changer facilement la destination au Sprint suivant."
 * L'Onboarding (Sprint 24) n'existe pas encore : chaque CTA Pricing route donc vers `/contact`
 * (réel, fonctionnel) en conservant le choix de plan dans la query string — un seul endroit à
 * modifier pour basculer vers `/onboarding?plan=...&billing=...` une fois cette route livrée.
 * Mission §25 — même destination pour le Pass AO : jamais un Checkout Stripe déclenché depuis un
 * visiteur anonyme sans organisation.
 */
export function getPlanCtaHref(plan: Lowercase<PlanTier> | "conseil", billing?: Lowercase<BillingInterval>): string {
  const params = new URLSearchParams({ plan });
  if (billing) params.set("billing", billing);
  return `/contact?${params.toString()}`;
}
