import { ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, TenderPermission } from "../../../tenders";
import type { ResponsePackageAccessService } from "../services/response-package-access.service";

/**
 * Point d'application dual-tier UNIQUE — même motif que `assertPricingScheduleTenderAccess`/
 * `assertTechnicalMemoTenderAccess` : le palier organisation (`TenderPermission`) est vérifié EN
 * PREMIER, indépendamment du palier client (`ClientPermission`, via
 * `ResponsePackageAccessService`) — jamais une seconde implémentation divergente de cette
 * composition.
 */
export async function assertResponsePackageTenderAccess(
  accessService: ResponsePackageAccessService,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
): Promise<string> {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UseResponsePackage);
  }
  return accessService.assertTenderAccess({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    tenderId: input.tenderId,
    permission: input.clientPermission,
  });
}

export async function assertResponsePackageAccess(
  accessService: ResponsePackageAccessService,
  input: { organizationId: string; responsePackageId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
) {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UseResponsePackage);
  }
  return accessService.loadPackage({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    responsePackageId: input.responsePackageId,
    permission: input.clientPermission,
  });
}
