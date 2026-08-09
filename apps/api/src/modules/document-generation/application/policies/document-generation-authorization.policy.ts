import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase, type TenderSummary } from "../../../tenders";

/**
 * Point d'application dual-tier UNIQUE pour toute lecture/mutation d'un document généré rattaché à
 * un Tender — même motif qu'`assertChatAccess`/`assertWorkspaceAccess` : `GetTenderUseCase` charge
 * le Tender (404 si absent/hors organisation) ET vérifie déjà `ClientPermission.ReadTender` (base
 * de lecture minimale) ; une seconde vérification cible ensuite la permission précise
 * (`ClientPermission.ReadDocumentGeneration`/`ManageDocumentGeneration`) — jamais une seconde
 * frontière de sécurité indépendante. Réutilisé pour TOUTES les routes Tender-scopées de ce module,
 * jamais recopié.
 *
 * Appelée à CHAQUE accès, y compris pour consulter une lignée déjà existante — si l'accès client a
 * été révoqué depuis la génération, elle devient invisible même à son auteur (même discipline
 * historique que Chat/Knowledge Base, jamais un accès hérité de `createdByUserId === actorId` seul).
 */
export async function assertDocumentGenerationAccess(
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
