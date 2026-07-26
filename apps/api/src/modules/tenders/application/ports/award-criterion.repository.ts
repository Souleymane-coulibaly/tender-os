import type { AwardCriterion } from "../../domain/award-criterion.entity";

export interface AwardCriterionRepository {
  findById(input: { organizationId: string; tenderId: string; criterionId: string }): Promise<AwardCriterion | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<AwardCriterion[]>;
  save(criterion: AwardCriterion): Promise<void>;
  delete(input: { organizationId: string; tenderId: string; criterionId: string }): Promise<void>;
}

export const AWARD_CRITERION_REPOSITORY = Symbol("AWARD_CRITERION_REPOSITORY");
