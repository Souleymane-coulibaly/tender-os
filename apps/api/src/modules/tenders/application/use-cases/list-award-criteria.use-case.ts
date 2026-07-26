import { Inject, Injectable } from "@nestjs/common";
import { TenderPermission } from "../../domain/tender-permission";
import { toAwardCriterionSummary, type AwardCriterionSummary } from "../dtos";
import {
  AWARD_CRITERION_REPOSITORY,
  type AwardCriterionRepository,
} from "../ports/award-criterion.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";

export type ListAwardCriteriaQuery = Readonly<{ organizationId: string; tenderId: string; actorRole: string }>;

@Injectable()
export class ListAwardCriteriaUseCase {
  constructor(
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
  ) {}

  async execute(query: ListAwardCriteriaQuery): Promise<AwardCriterionSummary[]> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const criteria = await this.criterionRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });

    return criteria.sort((a, b) => a.displayOrder - b.displayOrder).map(toAwardCriterionSummary);
  }
}
