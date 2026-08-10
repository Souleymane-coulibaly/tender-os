import { ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, TenderPermission } from "../../../tenders";
import type { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";

/**
 * Point d'application dual-tier UNIQUE — même motif que `assertTechnicalMemoTenderAccess`/
 * `assertChatAccess` : le palier organisation (`TenderPermission`, rôle sur le Tender) est vérifié
 * EN PREMIER, indépendamment du palier client (`ClientPermission`, via
 * `PricingScheduleAccessService`, qui charge le Tender/chiffrage et vérifie `ClientPermission`) —
 * jamais une seconde implémentation divergente de cette composition. `TenderPermission.Read`
 * (générique) reste suffisant pour la consultation ; toute mutation exige `UsePricingSchedule` aux
 * deux paliers.
 */
export async function assertPricingScheduleTenderAccess(
  accessService: PricingScheduleAccessService,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
): Promise<string> {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UsePricingSchedule);
  }
  return accessService.assertTenderAccess({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    tenderId: input.tenderId,
    permission: input.clientPermission,
  });
}

export async function assertPricingScheduleAccess(
  accessService: PricingScheduleAccessService,
  input: { organizationId: string; pricingScheduleId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
) {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UsePricingSchedule);
  }
  return accessService.loadSchedule({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    pricingScheduleId: input.pricingScheduleId,
    permission: input.clientPermission,
  });
}
