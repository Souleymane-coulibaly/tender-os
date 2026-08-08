import type { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import type { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";

/**
 * V2 Sprint 8 (correctif audit — same-org cross-client, mission §22/§64/§70) — point d'application
 * UNIQUE pour toute route par-identifiant de ce module (get/update/archive/restore/delete entry,
 * versions, documents, tags, validate). `CreateKnowledgeEntryUseCase`/`ListKnowledgeEntriesUseCase`/
 * `SearchKnowledgeBaseUseCase` vérifiaient déjà `ClientAccess` correctement (mission §"list/search
 * scopées") ; TOUTES les routes par-ID chargeaient l'entrée par `(id, organizationId)` SEUL,
 * sans jamais vérifier que l'acteur a réellement accès au `clientAccountId` de cette entrée
 * précise — un CONTRIBUTOR de l'organisation, muni d'un `entryId` d'un client auquel il n'est pas
 * affecté, pouvait lire/modifier/archiver/supprimer cette entrée. Corrigé en centralisant la
 * vérification ICI, appelée par CHAQUE use case par-ID, jamais recopiée.
 *
 * `entry.clientAccountId === undefined` = connaissance GLOBALE de l'organisation : aucune
 * vérification client supplémentaire (la permission `KnowledgePermission` au palier organisation
 * suffit déjà, mission §65 "ne pas appliquer naïvement ClientAccess à une entrée réellement
 * globale").
 */
export async function assertKnowledgeEntryClientAccess(
  assertClientAccessUseCase: AssertClientAccessUseCase,
  input: { organizationId: string; entry: KnowledgeEntry; actorId: string; actorRole: string; permission: ClientPermission },
): Promise<void> {
  if (!input.entry.clientAccountId) {
    return;
  }
  await assertClientAccessUseCase.execute({
    organizationId: input.organizationId,
    clientAccountId: input.entry.clientAccountId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    permission: input.permission,
  });
}
