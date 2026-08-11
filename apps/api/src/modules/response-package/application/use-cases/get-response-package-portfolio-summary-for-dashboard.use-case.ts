import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import type { ResponsePackageDashboardRow } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

export type GetResponsePackagePortfolioSummaryForDashboardQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string }>;

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

  async execute(query: GetResponsePackagePortfolioSummaryForDashboardQuery): Promise<readonly ResponsePackageDashboardRow[]> {
    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return [];
    }

    return this.responsePackageRepository.listForDashboard({
      organizationId: query.organizationId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
    });
  }
}
