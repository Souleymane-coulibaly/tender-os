import type { TenderStatus } from "./tenders-types";
import type { ResponsePackageStatus } from "./response-package-types";
import type { BadgeTone } from "../components/ui/badge";

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

export type ReadinessStatus = "NOT_READY" | "IN_PROGRESS" | "READY_WITH_WARNINGS" | "READY";

export type DashboardActivityTrendPoint = { date: string; count: number };

export type DashboardReadinessDistribution = {
  countByStatus: Partial<Record<ReadinessStatus, number>>;
  total: number;
};

export type DashboardDeadlineBucketCount = { bucket: DeadlineBucket; count: number };

/** Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum) — READ MODEL pur,
 *  chaque champ traçable à sa SOT (voir ANALYTICS_SOT_MATRIX du rapport final). `goRate` est déjà
 *  calculé côté backend (GO + GO_CONDITIONAL / décisions de la période) — jamais recalculé ici. */
export type DashboardAnalytics = {
  periodDays: number;
  activityTrend: DashboardActivityTrendPoint[];
  readinessDistribution: DashboardReadinessDistribution;
  deadlineBuckets: DashboardDeadlineBucketCount[];
  goRate: number | null;
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
  analytics: DashboardAnalytics;
};

export const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  NOT_READY: "Non prêt",
  IN_PROGRESS: "En cours",
  READY_WITH_WARNINGS: "Prêt (avec réserves)",
  READY: "Prêt",
};

export const DEADLINE_BUCKET_LABELS: Record<DeadlineBucket, string> = {
  OVERDUE: "En retard",
  TODAY: "Aujourd'hui",
  TOMORROW: "Demain",
  THIS_WEEK: "Cette semaine",
  LATER: "Plus tard",
};

/** Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2, mission §9 "centraliser business status →
 *  visual variant") — remplace `deadlineBucketBadgeClass` (classes brutes, supprimée), même motif
 *  que `tender-status-badge.tsx`/`go-no-go-section.tsx`. TOMORROW/THIS_WEEK convergent tous deux
 *  vers `warning`/`info` (le système `Badge` ne porte que 6 tons, jamais une nuance ambre
 *  supplémentaire inventée pour un seul appelant). */
export function deadlineBucketTone(bucket: DeadlineBucket): BadgeTone {
  switch (bucket) {
    case "OVERDUE":
      return "danger";
    case "TODAY":
    case "TOMORROW":
      return "warning";
    case "THIS_WEEK":
      return "info";
    default:
      return "neutral";
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

