import { Inject, Injectable } from "@nestjs/common";
import { getPlanCatalogEntry } from "../../domain/plan-catalog";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import type { PlanTier } from "../../domain/plan-tier";
import type { QuotaLimit, QuotaType } from "../../domain/quota-type";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../services/entitlement.service";

export type OrganizationEntitlementsSnapshot = Readonly<{
  planTier: PlanTier | null;
  entitlements: readonly EntitlementFeature[];
  quotas: Readonly<Record<QuotaType, QuotaLimit>> | null;
}>;

/**
 * V2 Sprint 22 (billing, étape 22A) — vue en LECTURE consommée par le futur écran "Abonnement &
 * utilisation" (22D) et le résumé Dashboard (22E). Ne consomme jamais le ledger AO (22B) : reste
 * limité à "quel plan / quelles limites déclarées", jamais "combien reste-t-il consommé".
 */
@Injectable()
export class GetOrganizationEntitlementsUseCase {
  constructor(@Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService) {}

  async execute(organizationId: string): Promise<OrganizationEntitlementsSnapshot> {
    const planTier = await this.entitlementService.getEffectivePlanTier(organizationId);
    if (planTier === null) {
      return { planTier: null, entitlements: [], quotas: null };
    }

    const catalogEntry = getPlanCatalogEntry(planTier);
    return {
      planTier,
      entitlements: Array.from(catalogEntry.entitlements),
      quotas: catalogEntry.quotas,
    };
  }
}
