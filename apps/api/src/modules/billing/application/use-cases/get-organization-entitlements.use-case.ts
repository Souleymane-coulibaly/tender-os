import { Inject, Injectable } from "@nestjs/common";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import type { PlanTier } from "../../domain/plan-tier";
import { QuotaType, type QuotaLimit } from "../../domain/quota-type";
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
 *
 * Correctif audit externe P2.3-E8 (P1) — renvoyait auparavant le catalogue statique
 * (`getPlanCatalogEntry(planTier).entitlements/.quotas`) tel quel, sans jamais consulter les
 * méthodes conscientes des overrides Platform Admin (`canUseFeature`/`getEffectiveLimit`,
 * `entitlement.service.ts`). Un `EntitlementOverride` actif était donc correctement appliqué à
 * l'autorisation réelle (`assertEntitlementFeature`/`runTenderOperationEntitled`) mais jamais
 * reflété par `GET /billing/entitlements` (la snapshot lue par la Billing UI). Toujours composer via
 * `entitlementService`, jamais relire `getPlanCatalogEntry` directement ici : le service est la
 * seule source de vérité pour "ce qui est effectivement autorisé", pas le catalogue brut.
 */
@Injectable()
export class GetOrganizationEntitlementsUseCase {
  constructor(@Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService) {}

  async execute(organizationId: string): Promise<OrganizationEntitlementsSnapshot> {
    const planTier = await this.entitlementService.getEffectivePlanTier(organizationId);
    if (planTier === null) {
      return { planTier: null, entitlements: [], quotas: null };
    }

    const featureChecks = await Promise.all(
      Object.values(EntitlementFeature).map(async (feature) => ({
        feature,
        enabled: await this.entitlementService.canUseFeature(organizationId, feature),
      })),
    );
    const entitlements = featureChecks.filter((check) => check.enabled).map((check) => check.feature);

    const quotaEntries = await Promise.all(
      Object.values(QuotaType).map(async (quota) => [quota, await this.entitlementService.getEffectiveLimit(organizationId, quota)] as const),
    );
    const quotas = Object.fromEntries(quotaEntries) as Record<QuotaType, QuotaLimit>;

    return { planTier, entitlements, quotas };
  }
}
