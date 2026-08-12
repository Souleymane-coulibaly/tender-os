import type { TaskSummary } from "../../workspace";
import type { TenderActivityType } from "../../workspace";
import type { TenderStatus, TenderListItemDto } from "../../tenders";
import type { ResponsePackageStatus } from "../../response-package";
import type { GoNoGoDecisionValue } from "../../opportunity";
import type { AttentionReason, DeadlineBucket } from "../domain/enums";

export type DashboardKpisDto = Readonly<{
  activeTenders: number;
  deadlinesNext7Days: number;
  overdueTenders: number;
  readyToSubmit: number;
  packagesReady: number;
  needingAttention: number;
  overdueTasks: number;
  /** V2 Sprint 18 (mission §66-68) — demandes de validation où l'utilisateur courant est
   *  l'approbateur désigné (`ListMyApprovalsUseCase`, `status: PENDING`), tous Tenders confondus. */
  pendingApprovals: number;
}>;

export type DashboardPipelineStageDto = Readonly<{ status: TenderStatus; count: number }>;

export type DashboardDeadlineItemDto = Readonly<{
  tenderId: string;
  title: string;
  clientAccountId: string;
  submissionDeadline: string;
  bucket: DeadlineBucket;
}>;

export type DashboardAttentionItemDto = Readonly<{
  tenderId: string;
  title: string;
  clientAccountId: string;
  status: TenderStatus;
  submissionDeadline?: string | undefined;
  bucket?: DeadlineBucket | undefined;
  reasons: readonly AttentionReason[];
  readinessScore: number;
  incompleteChecklistCount: number;
  lotPackages: readonly { lotId: string | null; status: ResponsePackageStatus }[];
}>;

export type DashboardPackagesDto = Readonly<{
  countByStatus: Readonly<Record<ResponsePackageStatus, number>>;
  total: number;
}>;

export type DashboardGoNoGoDto = Readonly<{
  countByDecision: Readonly<Record<GoNoGoDecisionValue, number>>;
  total: number;
  periodDays: number;
}>;

export type DashboardMyTasksDto = Readonly<{
  overdueCount: number;
  items: readonly TaskSummary[];
}>;

export type DashboardActivityItemDto = Readonly<{
  id: string;
  tenderId: string;
  type: TenderActivityType;
  summary: string;
  createdAt: string;
}>;

export type DashboardOverviewDto = Readonly<{
  generatedAt: string;
  scope: Readonly<{ allClients: boolean; clientAccountId?: string | undefined }>;
  kpis: DashboardKpisDto;
  pipeline: readonly DashboardPipelineStageDto[];
  deadlines: readonly DashboardDeadlineItemDto[];
  attentionItems: readonly DashboardAttentionItemDto[];
  packages: DashboardPackagesDto;
  goNoGo: DashboardGoNoGoDto;
  myTasks: DashboardMyTasksDto;
  activity: readonly DashboardActivityItemDto[];
  averageReadinessScore: number;
}>;

export const EMPTY_DASHBOARD_OVERVIEW: (generatedAt: string, scope: DashboardOverviewDto["scope"], periodDays: number) => DashboardOverviewDto = (generatedAt, scope, periodDays) => ({
  generatedAt,
  scope,
  kpis: { activeTenders: 0, deadlinesNext7Days: 0, overdueTenders: 0, readyToSubmit: 0, packagesReady: 0, needingAttention: 0, overdueTasks: 0, pendingApprovals: 0 },
  pipeline: [],
  deadlines: [],
  attentionItems: [],
  packages: { countByStatus: {} as Record<ResponsePackageStatus, number>, total: 0 },
  goNoGo: { countByDecision: {} as Record<GoNoGoDecisionValue, number>, total: 0, periodDays },
  myTasks: { overdueCount: 0, items: [] },
  activity: [],
  averageReadinessScore: 0,
});

export type { TenderListItemDto };
