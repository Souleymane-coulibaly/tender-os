import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { GO_NO_GO_DECISION_REPOSITORY, type GoNoGoDecisionRecord, type GoNoGoDecisionRepository } from "../ports/go-no-go-decision.repository";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type ListOpportunityGoNoGoDecisionsQuery = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
}>;

/** Historique complet, la plus récente d'abord (mission §18 "historique conservé, jamais écrasé"). */
@Injectable()
export class ListOpportunityGoNoGoDecisionsUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunityRepository: OpportunityRepository,
    @Inject(GO_NO_GO_DECISION_REPOSITORY) private readonly decisionRepository: GoNoGoDecisionRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListOpportunityGoNoGoDecisionsQuery): Promise<GoNoGoDecisionRecord[]> {
    assertHasOpportunityPermission(query.actorRole, OpportunityPermission.Read);

    const opportunity = assertOpportunityFound(
      await this.opportunityRepository.findById({ organizationId: query.organizationId, opportunityId: query.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadGoNoGo,
    });

    return this.decisionRepository.listByOpportunity({ organizationId: query.organizationId, opportunityId: query.opportunityId });
  }
}
