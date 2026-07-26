import type { Milestone } from "../../domain/milestone.entity";

export interface MilestoneRepository {
  findById(input: { organizationId: string; tenderId: string; milestoneId: string }): Promise<Milestone | null>;
  listByTender(input: { organizationId: string; tenderId: string }): Promise<Milestone[]>;
  save(milestone: Milestone): Promise<void>;
  delete(input: { organizationId: string; tenderId: string; milestoneId: string }): Promise<void>;
}

export const MILESTONE_REPOSITORY = Symbol("MILESTONE_REPOSITORY");
