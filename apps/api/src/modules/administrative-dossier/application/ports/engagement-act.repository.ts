import type { EngagementAct } from "../../domain/engagement-act.aggregate";

export interface EngagementActRepository {
  create(act: EngagementAct): Promise<void>;
  findById(input: { organizationId: string; engagementActId: string }): Promise<EngagementAct | null>;
  findByTenderId(input: { organizationId: string; tenderId: string }): Promise<EngagementAct | null>;
  save(act: EngagementAct): Promise<void>;
}

export const ENGAGEMENT_ACT_REPOSITORY = Symbol("ENGAGEMENT_ACT_REPOSITORY");
