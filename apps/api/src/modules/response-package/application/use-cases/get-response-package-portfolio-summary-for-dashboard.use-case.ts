import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import type { ResponsePackageCountByStatus, ResponsePackageDashboardRow } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

export type GetResponsePackagePortfolioSummaryForDashboardQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  /** Filtre client demandé dans l'UI — poussé dans le SQL (Checkpoint E12), jamais appliqué en
   *  mémoire par l'appelant après avoir chargé tout le portefeuille. */
  clientAccountId?: string | undefined;
  /** Tenders réellement rendus par le Dashboard : seules ces lignes détaillées sont matérialisées. */
  tenderIds: readonly string[];
}>;

/** Checkpoint TENDEROS-2.1-P2.3-E12 — `countByStatus`/`total` sont des agrégats CURRENT_STATE
 *  calculés par PostgreSQL sur l'état courant GLOBAL du portefeuille accessible (aucun cutoff
 *  temporel : leur définition métier l'exige) ; `rowsForTenders` est la seule partie matérialisée,
 *  bornée aux Tenders affichés. */
export type ResponsePackagePortfolioSummaryForDashboard = Readonly<{
  countByStatus: ResponsePackageCountByStatus;
  total: number;
  rowsForTenders: readonly ResponsePackageDashboardRow[];
}>;

const EMPTY_SUMMARY: ResponsePackagePortfolioSummaryForDashboard = { countByStatus: {}, total: 0, rowsForTenders: [] };

/** V2 Sprint 15 (Dashboard) — lecture seule pour `dashboard` : réutilise `ListAccessibleClientsUseCase`
 *  (même motif que `ListResponsePackagesUseCase`/`GetPackageCompletenessUseCase`), jamais un
 *  `GetPackageCompletenessUseCase` par package (mission §54 "pas de N+1") — le statut dénormalisé
 *  (`ResponsePackage.status`) suffit pour le KPI "packages prêts" et le widget "à traiter"
 *  (mission §64 "ne pas recalculer la readiness différemment du Sprint 14"). */
@Injectable()
export class GetResponsePackagePortfolioSummaryForDashboardUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly responsePackageRepository: ResponsePackageRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: GetResponsePackagePortfolioSummaryForDashboardQuery): Promise<ResponsePackagePortfolioSummaryForDashboard> {
    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return EMPTY_SUMMARY;
    }

    const scope = {
      organizationId: query.organizationId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      clientAccountId: query.clientAccountId,
    };

    const [countByStatus, rowsForTenders] = await Promise.all([
      this.responsePackageRepository.countByStatusForDashboard(scope),
      this.responsePackageRepository.listForDashboardTenders({ ...scope, tenderIds: query.tenderIds }),
    ]);

    return { countByStatus, total: Object.values(countByStatus).reduce((sum, count) => sum + count, 0), rowsForTenders };
  }
}
