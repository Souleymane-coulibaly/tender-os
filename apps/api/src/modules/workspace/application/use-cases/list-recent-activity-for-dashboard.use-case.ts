import { Inject, Injectable } from "@nestjs/common";
import { TENDER_ACTIVITY_REPOSITORY, type TenderActivityRecord, type TenderActivityRepository } from "../ports/tender-activity.repository";

export type ListRecentActivityForDashboardQuery = Readonly<{ organizationId: string; tenderIds: readonly string[]; limit: number }>;

/** V2 Sprint 15 (Dashboard) — lecture seule pour `dashboard` : `tenderIds` doit déjà être le
 *  périmètre ClientAccess résolu par l'appelant (mission §41 "ne jamais afficher... si Alice n'a
 *  pas ClientAccess"), jamais une seconde résolution d'accès ici — même motif que les autres
 *  use-cases "for-dashboard" (`GetGoNoGoSummaryForDashboardUseCase`,
 *  `GetResponsePackagePortfolioSummaryForDashboardUseCase`). Réutilise le même catalogue
 *  `TenderActivityType`/les mêmes enregistrements que le fil Sprint 7, jamais un second système
 *  d'activité (AuditLog/Outbox n'ont pas de colonne tenderId/clientAccountId exploitable — voir
 *  audit Sprint 15). */
@Injectable()
export class ListRecentActivityForDashboardUseCase {
  constructor(@Inject(TENDER_ACTIVITY_REPOSITORY) private readonly activityRepository: TenderActivityRepository) {}

  async execute(query: ListRecentActivityForDashboardQuery): Promise<TenderActivityRecord[]> {
    if (query.tenderIds.length === 0) {
      return [];
    }
    return this.activityRepository.listByTenderIds({ organizationId: query.organizationId, tenderIds: query.tenderIds, limit: query.limit });
  }
}
