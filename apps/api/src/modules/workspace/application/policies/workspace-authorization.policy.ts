import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase, type TenderSummary } from "../../../tenders";

/**
 * V2 Sprint 7 — point d'application dual-tier UNIQUE pour toute lecture/mutation du Workspace
 * (participants, tâches, commentaires, mentions, approbations, activité). `tenders` n'exporte
 * jamais l'agrégat `Tender` brut hors de son propre module (seulement `TenderSummary` via
 * `GetTenderUseCase`, même convention déjà suivie par `checklist-intelligence.controller.ts`) :
 * `GetTenderUseCase` charge le Tender (404 `TenderNotFoundError` si absent/hors organisation) ET
 * vérifie déjà `ClientPermission.ReadTender` (base de lecture minimale, cohérente : tout rôle
 * disposant d'une permission Workspace dispose aussi de `ReadTender`, voir la matrice
 * `ROLE_CLIENT_ACTION_PERMISSIONS`). Une seconde vérification cible ensuite la permission Workspace
 * précise (`ReadWorkspace`/`ManageWorkspace`/`ValidateWorkspace`) — jamais une seconde frontière de
 * sécurité indépendante (mission §4/§41). Réutilisé pour TOUTES les routes Workspace, jamais recopié.
 */
export async function assertWorkspaceAccess(
  getTenderUseCase: GetTenderUseCase,
  assertClientAccessUseCase: AssertClientAccessUseCase,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string; permission: ClientPermission },
): Promise<TenderSummary> {
  const tender = await getTenderUseCase.execute({
    organizationId: input.organizationId,
    tenderId: input.tenderId,
    actorId: input.actorId,
    actorRole: input.actorRole,
  });

  await assertClientAccessUseCase.execute({
    organizationId: input.organizationId,
    clientAccountId: tender.clientAccountId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    permission: input.permission,
  });

  return tender;
}
