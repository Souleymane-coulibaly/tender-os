import type { TenderStatus } from "./tenders-types";
import type { ResponsePackageStatus } from "./response-package-types";

export type DeadlineBucket = "OVERDUE" | "TODAY" | "TOMORROW" | "THIS_WEEK" | "LATER";
export type AttentionReason = "DEADLINE_OVERDUE" | "DEADLINE_URGENT" | "CHECKLIST_INCOMPLETE" | "PACKAGE_NOT_READY" | "READINESS_AT_RISK";
export type GoNoGoDecisionValue = "GO" | "GO_CONDITIONAL" | "NO_GO";

export type DashboardKpis = {
  activeTenders: number;
  deadlinesNext7Days: number;
  overdueTenders: number;
  readyToSubmit: number;
  packagesReady: number;
  needingAttention: number;
  overdueTasks: number;
  /** V2 Sprint 18 (mission §66-68) — demandes de validation où l'utilisateur courant est
   *  l'approbateur désigné, tous Tenders confondus. */
  pendingApprovals: number;
};

export type DashboardPipelineStage = { status: TenderStatus; count: number };

export type DashboardDeadlineItem = {
  tenderId: string;
  title: string;
  clientAccountId: string;
  submissionDeadline: string;
  bucket: DeadlineBucket;
};

export type DashboardAssignee = { userId: string; displayName: string };

export type DashboardAttentionItem = {
  tenderId: string;
  title: string;
  clientAccountId: string;
  status: TenderStatus;
  submissionDeadline?: string;
  bucket?: DeadlineBucket;
  reasons: AttentionReason[];
  readinessScore: number;
  incompleteChecklistCount: number;
  lotPackages: { lotId: string | null; status: ResponsePackageStatus }[];
  buyerName?: string;
  lotCount: number;
  assignees: DashboardAssignee[];
};

export type DashboardPackages = {
  countByStatus: Partial<Record<ResponsePackageStatus, number>>;
  total: number;
};

export type DashboardGoNoGo = {
  countByDecision: Partial<Record<GoNoGoDecisionValue, number>>;
  total: number;
  periodDays: number;
};

export type DashboardTaskSummary = {
  id: string;
  tenderId: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
};

export type DashboardMyTasks = {
  overdueCount: number;
  items: DashboardTaskSummary[];
};

export type DashboardActivityItem = {
  id: string;
  tenderId: string;
  type: string;
  summary: string;
  createdAt: string;
};

export type DashboardRecommendedOpportunity = {
  externalTenderId: string;
  savedSearchId: string;
  title: string;
  buyerName?: string;
  score: number;
  matchedLabels: string[];
};

export type DashboardMarketWatch = {
  hasSavedSearches: boolean;
  relevantOpportunitiesCount: number;
  recommended: DashboardRecommendedOpportunity[];
};

export type ActivationChecklistItemId =
  | "ACCOUNT_CREATED"
  | "ORGANIZATION_CONFIGURED"
  | "CANDIDATE_COMPANY_COMPLETE"
  | "ADMINISTRATIVE_DOCUMENTS_ADDED"
  | "MARKET_WATCH_CONFIGURED"
  | "FIRST_DCE_IMPORTED"
  | "COLLABORATOR_INVITED";

export type DashboardActivationChecklistItem = { id: ActivationChecklistItemId; label: string; completed: boolean };

export type DashboardActivationChecklist = {
  items: DashboardActivationChecklistItem[];
  completedCount: number;
  totalCount: number;
};

export type DashboardOverview = {
  generatedAt: string;
  scope: { allClients: boolean; clientAccountId?: string };
  kpis: DashboardKpis;
  pipeline: DashboardPipelineStage[];
  deadlines: DashboardDeadlineItem[];
  attentionItems: DashboardAttentionItem[];
  packages: DashboardPackages;
  goNoGo: DashboardGoNoGo;
  myTasks: DashboardMyTasks;
  activity: DashboardActivityItem[];
  marketWatch: DashboardMarketWatch;
  activationChecklist: DashboardActivationChecklist;
  averageReadinessScore: number;
};

export const DEADLINE_BUCKET_LABELS: Record<DeadlineBucket, string> = {
  OVERDUE: "En retard",
  TODAY: "Aujourd'hui",
  TOMORROW: "Demain",
  THIS_WEEK: "Cette semaine",
  LATER: "Plus tard",
};

export function deadlineBucketBadgeClass(bucket: DeadlineBucket): string {
  switch (bucket) {
    case "OVERDUE":
      return "bg-red-100 text-red-800";
    case "TODAY":
      return "bg-amber-100 text-amber-800";
    case "TOMORROW":
      return "bg-amber-50 text-amber-700";
    case "THIS_WEEK":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-neutral-100 text-neutral-600";
  }
}

export const ATTENTION_REASON_LABELS: Record<AttentionReason, string> = {
  DEADLINE_OVERDUE: "Échéance dépassée",
  DEADLINE_URGENT: "Échéance imminente",
  CHECKLIST_INCOMPLETE: "Checklist incomplète",
  PACKAGE_NOT_READY: "Dossier de réponse non prêt",
  READINESS_AT_RISK: "Préparation insuffisante",
};

export const GO_NO_GO_LABELS: Record<GoNoGoDecisionValue, string> = {
  GO: "GO",
  GO_CONDITIONAL: "GO conditionnel",
  NO_GO: "NO GO",
};

export function goNoGoBadgeClass(decision: GoNoGoDecisionValue): string {
  switch (decision) {
    case "GO":
      return "bg-green-100 text-green-800";
    case "GO_CONDITIONAL":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-red-100 text-red-800";
  }
}
