import { TenderArchivedError } from "../../domain/errors";
import { TenderStatus } from "../../domain/tender-status";
import type { Tender } from "../../domain/tender.aggregate";

/**
 * Règle centralisée (AUDIT-001) : aucune mutation d'un lot n'est permise lorsque le Tender
 * parent est archivé — création, modification, suppression logique, restauration,
 * réordonnancement. Appelée par chaque cas d'usage juste après le chargement du Tender, pour
 * éviter de dupliquer cette vérification dans les cinq cas d'usage mutateurs.
 */
export function assertTenderNotArchivedForLotMutation(tender: Tender): void {
  if (tender.status === TenderStatus.Archived) {
    throw new TenderArchivedError();
  }
}
