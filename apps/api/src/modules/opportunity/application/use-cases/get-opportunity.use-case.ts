import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { OpportunityPermission } from "../../domain/opportunity-permission";
import { assertOpportunityFound } from "../../domain/opportunity.aggregate";
import { toOpportunitySummary, type OpportunitySummary } from "../dtos";
import { OPPORTUNITY_REPOSITORY, type OpportunityRepository } from "../ports/opportunity.repository";
import { assertHasOpportunityPermission } from "../policies/opportunity-authorization.policy";
import { assertOpportunityClientAccessAllowed } from "../policies/opportunity-client-access.policy";

export type GetOpportunityQuery = Readonly<{
  organizationId: string;
  opportunityId: string;
  actorId: string;
  actorRole: string;
}>;

@Injectable()
export class GetOpportunityUseCase {
  constructor(
    @Inject(OPPORTUNITY_REPOSITORY) private readonly repository: OpportunityRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetOpportunityQuery): Promise<OpportunitySummary> {
    assertHasOpportunityPermission(query.actorRole, OpportunityPermission.Read);

    const opportunity = assertOpportunityFound(
      await this.repository.findById({ organizationId: query.organizationId, opportunityId: query.opportunityId }),
    );

    await assertOpportunityClientAccessAllowed(opportunity, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadOpportunity,
    });

    return toOpportunitySummary(opportunity);
  }
}
