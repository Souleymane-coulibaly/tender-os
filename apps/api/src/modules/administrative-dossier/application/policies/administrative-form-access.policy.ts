import { ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, TenderPermission } from "../../../tenders";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";

/**
 * V2 Sprint 11 — point d'application dual-tier UNIQUE pour le préremplissage/génération des
 * formulaires officiels réels (DC1/DC4), même motif que `assertDocumentGenerationAccess`
 * (document-generation) / `assertChatAccess` : le palier organisation (`TenderPermission`, rôle sur
 * le Tender) est vérifié EN PREMIER, indépendamment du palier client (`ClientPermission` via
 * `AdministrativeDossierAccessService.assertTenderAccess`, qui charge déjà le Tender et vérifie
 * `ClientPermission.ReadTender`) — jamais une seconde implémentation divergente de cette
 * composition. `TenderPermission.Read` (générique) reste suffisant pour la consultation ; seule la
 * GÉNÉRATION exige `GenerateAdministrativeForm` aux deux paliers (mission §51/§52 "consulter sans
 * pouvoir générer").
 */
export async function assertAdministrativeFormAccess(
  accessService: AdministrativeDossierAccessService,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string; clientPermission: ClientPermission; requireGenerateOrgPermission?: boolean },
): Promise<string> {
  if (input.requireGenerateOrgPermission) {
    assertHasTenderPermission(input.actorRole, TenderPermission.GenerateAdministrativeForm);
  }
  return accessService.assertTenderAccess({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    tenderId: input.tenderId,
    permission: input.clientPermission,
  });
}
