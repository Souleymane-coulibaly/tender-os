import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { TenderLotMismatchError, TenderNotFoundError } from "../../domain/errors";
import type { Tender } from "../../domain/tender.aggregate";
import type { TenderRepository } from "../ports/tender.repository";
import type { TenderLotRepository } from "../ports/tender-lot.repository";

/**
 * Correction anomalie P0 ("Mutations Tenders non client-aware") — point d'application UNIQUE pour
 * toute mutation dérivée d'un Tender (le Tender lui-même : update/archive/changeStatus ; et ses
 * sous-ressources : lots, checklist, critères, documents demandés, jalons, risques, alertes).
 * Charge le Tender (jamais fait confiance à un `tenderId` non vérifié — corrige au passage
 * l'absence totale de vérification d'existence sur plusieurs sous-ressources), PUIS applique la
 * policy d'accès client centralisée (`AssertClientAccessUseCase`, module Client Portfolio) avec la
 * permission `CLIENT_UPDATE_TENDER` — la même pour toute mutation de contenu du Tender ou de l'une
 * de ses sous-ressources, aucune permission client plus fine n'étant définie par la mission pour
 * ces sous-types. Un utilisateur affecté au Client A ne peut donc jamais muter une ressource d'un
 * Tender du Client B par identifiant direct — l'erreur renvoyée (404 `ClientAccountNotFoundError`
 * pour un acteur sans aucune affectation, 403 `ClientPermissionMissingError` pour un rôle client
 * insuffisant) ne révèle jamais l'existence du client inaccessible, même convention que
 * `GetTenderUseCase`. OWNER/ORGANIZATION_ADMIN restent autorisés sans affectation (policy
 * centralisée). Retourne le Tender chargé pour que les appelants qui en ont déjà besoin (update/
 * archive/changeStatus) ne le rechargent pas une seconde fois.
 */
export async function assertTenderMutationAllowed(
  tenderRepository: TenderRepository,
  assertClientAccessUseCase: AssertClientAccessUseCase,
  input: { organizationId: string; tenderId: string; actorId: string; actorRole: string },
): Promise<Tender> {
  const tender = await tenderRepository.findById({ organizationId: input.organizationId, tenderId: input.tenderId });
  if (!tender) {
    throw new TenderNotFoundError();
  }

  await assertClientAccessUseCase.execute({
    organizationId: input.organizationId,
    clientAccountId: tender.clientAccountId,
    actorId: input.actorId,
    actorRole: input.actorRole,
    permission: ClientPermission.UpdateTender,
  });

  return tender;
}

/**
 * Correction audit Codex P1 (V2 Sprint 3, IDOR horizontal) — un `lotId` fourni à une sous-ressource
 * du Tender (critère, pièce demandée, jalon, risque) doit appartenir au `tenderId` de la route. La
 * contrainte FK composite `(lotId, organizationId)` posée par la migration ne protège que le
 * tenant, jamais le Tender précis : un lot du Tender B de la MÊME organisation la satisfait tout
 * autant. Sans ce contrôle, un acteur autorisé sur le Tender A peut rattacher une sous-ressource du
 * Tender A à un lot du Tender B. `lotRepository.findById` scope déjà par `(organizationId,
 * tenderId, lotId)` (et exclut les lots supprimés) — le réutiliser ici évite toute seconde requête
 * ad hoc. Ne fait rien si `lotId` est absent (rattachement au niveau Tender global, cas normal).
 */
export async function assertLotBelongsToTender(
  lotRepository: TenderLotRepository,
  input: { organizationId: string; tenderId: string; lotId?: string | undefined },
): Promise<void> {
  if (input.lotId === undefined) {
    return;
  }
  const lot = await lotRepository.findById({ organizationId: input.organizationId, tenderId: input.tenderId, lotId: input.lotId });
  if (!lot) {
    throw new TenderLotMismatchError();
  }
}
