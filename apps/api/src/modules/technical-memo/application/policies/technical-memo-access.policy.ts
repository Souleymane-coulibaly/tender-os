import { ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, TenderPermission } from "../../../tenders";
import type { TechnicalMemoAccessService } from "../services/technical-memo-access.service";

/**
 * Point d'application dual-tier UNIQUE (mission §75/§76) — même motif que
 * `assertAdministrativeFormAccess`/`assertDocumentGenerationAccess`/`assertChatAccess` : le palier
 * organisation (`TenderPermission`, rôle sur le Tender) est vérifié EN PREMIER, indépendamment du
 * palier client (`ClientPermission`, via `TechnicalMemoAccessService`, qui charge le Tender/mémoire
 * et vérifie `ClientPermission`) — jamais une seconde implémentation divergente de cette
 * composition. `TenderPermission.Read` (générique) reste suffisant pour la consultation ; toute
 * mutation exige `UseTechnicalMemo` aux deux paliers.
 */
export async function assertTechnicalMemoTenderAccess(
  accessService: TechnicalMemoAccessService,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
): Promise<string> {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UseTechnicalMemo);
  }
  return accessService.assertTenderAccess({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    tenderId: input.tenderId,
    permission: input.clientPermission,
  });
}

export async function assertTechnicalMemoAccess(
  accessService: TechnicalMemoAccessService,
  input: { organizationId: string; technicalMemoId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireUseOrgPermission?: boolean },
) {
  if (input.requireUseOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.UseTechnicalMemo);
  }
  return accessService.loadMemo({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    technicalMemoId: input.technicalMemoId,
    permission: input.clientPermission,
  });
}
