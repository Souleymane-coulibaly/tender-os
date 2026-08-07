import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OpportunityQuickScoreNotFoundError } from "../../domain/errors";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { OPPORTUNITY_QUICK_SCORE_REPOSITORY, type OpportunityQuickScoreRecord, type OpportunityQuickScoreRepository } from "../ports/opportunity-quick-score.repository";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type GetOpportunityQuickScoreQuery = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class GetOpportunityQuickScoreUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunityRepository: OpportunityRepository,
    @Inject(OPPORTUNITY_QUICK_SCORE_REPOSITORY) private readonly quickScoreRepository: OpportunityQuickScoreRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetOpportunityQuickScoreQuery): Promise<OpportunityQuickScoreRecord> {
    assertHasOpportunityPermission(query.actorRole, OpportunityPermission.Read);

    const opportunity = assertOpportunityFound(
      await this.opportunityRepository.findById({ organizationId: query.organizationId, opportunityId: query.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadOpportunity,
    });

    const latest = await this.quickScoreRepository.getLatest({ organizationId: query.organizationId, opportunityId: query.opportunityId });
    if (!latest) {
      throw new OpportunityQuickScoreNotFoundError();
    }
    return latest;
  }
}
