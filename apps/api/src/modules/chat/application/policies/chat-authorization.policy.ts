import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase, type TenderSummary } from "../../../tenders";

/**
 * V2 Sprint 9 — point d'application dual-tier UNIQUE pour toute lecture/mutation du Chat, même
 * motif que `assertWorkspaceAccess` (module Workspace, Sprint 7) : `GetTenderUseCase` charge le
 * Tender (404 `TenderNotFoundError` si absent/hors organisation) ET vérifie déjà
 * `ClientPermission.ReadTender` (base de lecture minimale) ; une seconde vérification cible ensuite
 * la permission Chat précise (`ClientPermission.ReadChat`/`UseChat`) — jamais une seconde frontière
 * de sécurité indépendante. Réutilisé pour TOUTES les routes Chat, jamais recopié.
 *
 * Mission §45 (sécurité historique) — appelée à CHAQUE accès, y compris pour consulter une
 * conversation déjà existante : si l'accès client a été révoqué depuis la création de la
 * conversation, celle-ci devient invisible même à son auteur, jamais un accès hérité de
 * `createdByUserId === actorId` seul.
 */
export async function assertChatAccess(
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
