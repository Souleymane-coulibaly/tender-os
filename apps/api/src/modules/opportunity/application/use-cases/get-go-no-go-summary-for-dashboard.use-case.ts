import { Inject, Injectable } from "@nestjs/common";
import { GoNoGoDecisionValue } from "../../domain/go-no-go-decision";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";

export type GetGoNoGoSummaryForDashboardQuery = Readonly<{ organizationId: string; tenderIds: readonly string[]; since: Date }>;

export type GoNoGoSummaryForDashboard = Readonly<{
  countByDecision: Readonly<Record<GoNoGoDecisionValue, number>>;
  total: number;
}>;

/** V2 Sprint 15 (Dashboard) — lecture seule pour `dashboard` : `tenderIds` doit déjà être le
 *  périmètre ClientAccess résolu par l'appelant (mission §26 "afficher sur période GO/GO_CONDITIONAL/
 *  NO_GO, ne pas transformer cela en taux de succès commercial" — un simple décompte de décisions
 *  Niveau TENDER sur la période, jamais un score recalculé). Même motif que les autres use-cases
 *  "for-dashboard" (`ListRecentActivityForDashboardUseCase`, `GetResponsePackagePortfolioSummaryForDashboardUseCase`) :
 *  aucune seconde résolution d'accès ici. */
@Injectable()
export class GetGoNoGoSummaryForDashboardUseCase {
  constructor(@Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository) {}

  async execute(query: GetGoNoGoSummaryForDashboardQuery): Promise<GoNoGoSummaryForDashboard> {
    if (query.tenderIds.length === 0) {
      return { countByDecision: { [GoNoGoDecisionValue.Go]: 0, [GoNoGoDecisionValue.GoConditional]: 0, [GoNoGoDecisionValue.NoGo]: 0 }, total: 0 };
    }

    const decisions = await this.decisionRepository.listRecentByTenderIds({ organizationId: query.organizationId, tenderIds: query.tenderIds, since: query.since });

    const countByDecision: Record<GoNoGoDecisionValue, number> = { [GoNoGoDecisionValue.Go]: 0, [GoNoGoDecisionValue.GoConditional]: 0, [GoNoGoDecisionValue.NoGo]: 0 };
    for (const decision of decisions) {
      countByDecision[decision.decision] += 1;
    }

    return { countByDecision, total: decisions.length };
  }
}
