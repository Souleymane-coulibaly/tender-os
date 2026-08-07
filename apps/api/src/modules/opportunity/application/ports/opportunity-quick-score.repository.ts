import type { QuickScoreResult } from "../../domain/scoring/compute-opportunity-quick-score";

export type OpportunityQuickScoreRecord = Readonly<{
  id: string;
  organizationId: string;
  opportunityId: string;
  scoreVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  dataSnapshot: unknown;
  createdAt: string;
}> &
  QuickScoreResult;

export type CreateOpportunityQuickScoreInput = Readonly<{
  id: string;
  organizationId: string;
  opportunityId: string;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  dataSnapshot: unknown;
  createdAt: Date;
  result: QuickScoreResult;
}>;

export interface OpportunityQuickScoreRepository {
  create(input: CreateOpportunityQuickScoreInput): Promise<OpportunityQuickScoreRecord>;
  /** Version la plus élevée déjà attribuée pour cette Opportunity — `0` si aucune n'existe encore
   *  (la prochaine sera `1`). Même motif que `resolveLatestAnalysisVersion` (module `analysis`). */
  getLatestVersion(input: { organizationId: string; opportunityId: string }): Promise<number>;
  getLatest(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord | null>;
  listVersions(input: { organizationId: string; opportunityId: string }): Promise<OpportunityQuickScoreRecord[]>;
}

export const OPPORTUNITY_QUICK_SCORE_REPOSITORY = Symbol("OPPORTUNITY_QUICK_SCORE_REPOSITORY");
