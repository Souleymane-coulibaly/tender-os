import type { TenderSummary } from "../../../tenders";
import { TenderArchivedForDceMutationError } from "../../domain/errors";

/**
 * Règle centralisée (mission Sprint 0 §"règles métier") : aucune mutation du DCE (création,
 * import, remplacement, suppression) n'est permise lorsque le Tender parent est archivé.
 *
 * DCE ne dépend que de la façade publique de Tenders (GetTenderUseCase / TenderSummary) — voir
 * tenders/index.ts — jamais de son agrégat interne. `archivedAt` est donc utilisé plutôt que le
 * statut littéral "ARCHIVED" : c'est le seul signal exposé par TenderSummary qui correspond
 * exactement (et uniquement) à l'état archivé de l'agrégat Tender (voir tender.aggregate.ts).
 */
export function assertTenderNotArchivedForDceMutation(tender: TenderSummary): void {
  if (tender.archivedAt !== undefined) {
    throw new TenderArchivedForDceMutationError();
  }
}
