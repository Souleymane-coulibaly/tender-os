import { publicApiFetch } from "../../../lib/public-api-client";
import type { PublicPlanCatalogEntry } from "../../../lib/billing-types";

/** Mission : SEULE source de vérité Pricing — jamais un second catalogue maintenu à la main ici,
 *  même motif que `ContactPage`/`PricingSection` (Sprint 23). Si ce catalogue ne contient plus les
 *  paliers STARTER/BUSINESS/ENTERPRISE attendus, c'est un signal d'alerte (mission "STOP et
 *  signaler si le catalogue diverge") — jamais corrigé silencieusement ici. */
export async function fetchOnboardingPlanCatalog(): Promise<PublicPlanCatalogEntry[]> {
  const result = await publicApiFetch<{ items: PublicPlanCatalogEntry[] }>("/api/v1/billing/plan-catalog");
  return result.items;
}
