import { Injectable } from "@nestjs/common";
import { PLAN_CATALOG } from "../../domain/plan-catalog";
import { PlanTier } from "../../domain/plan-tier";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import type { BillingInterval } from "../../domain/billing-interval";
import type { EntitlementFeature } from "../../domain/entitlement-feature";

export type PublicPlanCatalogEntry = Readonly<{
  tier: PlanTier;
  displayName: string;
  billingIntervalsSupported: readonly BillingInterval[];
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  onePriceCents: number | null;
  entitlements: readonly EntitlementFeature[];
  quotas: Readonly<Record<QuotaType, QuotaLimit>>;
}>;

/**
 * V2 Sprint 23 (landing) — mission §17 "NE PAS recréer une deuxième source de vérité Pricing" :
 * seule vue en LECTURE, sans authentification, sur `PLAN_CATALOG` (22A) — jamais un second
 * catalogue maintenu à la main côté frontend. Rien ici n'est sensible : prix/quotas/entitlements
 * sont déjà des informations commerciales publiques (affichées sur la page Tarifs). Convertit les
 * `Set` du domaine en tableaux (jamais sérialisables tels quels en JSON).
 */
@Injectable()
export class GetPublicPlanCatalogUseCase {
  execute(): readonly PublicPlanCatalogEntry[] {
    return Object.values(PlanTier).map((tier) => {
      const entry = PLAN_CATALOG[tier];
      return {
        tier: entry.tier,
        displayName: entry.displayName,
        billingIntervalsSupported: entry.billingIntervalsSupported,
        monthlyPriceCents: entry.monthlyPriceCents,
        yearlyPriceCents: entry.yearlyPriceCents,
        onePriceCents: entry.onePriceCents,
        entitlements: Array.from(entry.entitlements),
        quotas: entry.quotas,
      };
    });
  }
}
