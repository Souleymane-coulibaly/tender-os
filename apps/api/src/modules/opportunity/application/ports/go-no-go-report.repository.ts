import type { GoNoGoReportResult } from "../../domain/scoring/compute-go-no-go-report";

export type GoNoGoReportRecord = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  reportVersion: number;
  analysisVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  generatedAt: string;
}> &
  GoNoGoReportResult;

export type CreateGoNoGoReportInput = Readonly<{
  id: string;
  organizationId: string;
  tenderId: string;
  analysisVersion: number;
  calculationVersion: string;
  requestedByUserId?: string | undefined;
  generatedAt: Date;
  result: GoNoGoReportResult;
}>;

export interface GoNoGoReportRepository {
  create(input: CreateGoNoGoReportInput): Promise<GoNoGoReportRecord>;
  /** Version la plus élevée déjà attribuée pour ce Tender — `0` si aucune n'existe encore (la
   *  prochaine sera `1`). Même motif que `OpportunityQuickScoreRepository.getLatestVersion`. */
  getLatestVersion(input: { organizationId: string; tenderId: string }): Promise<number>;
  getLatest(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord | null>;
  listVersions(input: { organizationId: string; tenderId: string }): Promise<GoNoGoReportRecord[]>;
  findById(input: { organizationId: string; tenderId: string; reportId: string }): Promise<GoNoGoReportRecord | null>;
}

export const GO_NO_GO_REPORT_REPOSITORY = Symbol("GO_NO_GO_REPORT_REPOSITORY");
