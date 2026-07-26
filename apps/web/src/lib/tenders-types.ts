export type PageResponse<T> = {
  items: T[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
};

export type TenderStatus =
  | "DRAFT"
  | "IN_ANALYSIS"
  | "READY"
  | "IN_PREPARATION"
  | "READY_TO_SUBMIT"
  | "SUBMITTED"
  | "WON"
  | "LOST"
  | "ARCHIVED";

export type Tender = {
  id: string;
  organizationId: string;
  title: string;
  reference?: string;
  buyerName?: string;
  description?: string;
  publicationDate?: string;
  submissionDeadline?: string;
  procedureType?: string;
  marketType?: string;
  estimatedAmount?: string;
  currency?: string;
  internalOwnerId?: string;
  status: TenderStatus;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  version: number;
};

export type TenderLot = {
  id: string;
  tenderId: string;
  lotNumber: string;
  title: string;
  description?: string;
  estimatedAmount?: string;
  currency?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChecklistItemStatus = "TODO" | "IN_PROGRESS" | "COMPLETED" | "NOT_APPLICABLE";

export type ChecklistItem = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  required: boolean;
  status: ChecklistItemStatus;
  assignedTo?: string;
  dueDate?: string;
  comment?: string;
  completedAt?: string;
  completedBy?: string;
  displayOrder: number;
};

export type AwardCriterion = {
  id: string;
  tenderId: string;
  name: string;
  description?: string;
  weight: string;
  parentCriterionId?: string;
  displayOrder: number;
};

export type RequestedDocumentStatus = "PENDING" | "PROVIDED" | "VALIDATED" | "REJECTED";

export type RequestedDocument = {
  id: string;
  tenderId: string;
  name: string;
  category?: string;
  documentType?: string;
  required: boolean;
  description?: string;
  expirationDate?: string;
  status: RequestedDocumentStatus;
  documentId?: string;
  displayOrder: number;
};

export type MilestoneType =
  | "SUBMISSION_DEADLINE"
  | "QUESTION_DEADLINE"
  | "MANDATORY_VISIT"
  | "INTERNAL_VALIDATION"
  | "CUSTOM";
export type MilestoneStatus = "PENDING" | "DONE";

export type Milestone = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  date: string;
  type: MilestoneType;
  status: MilestoneStatus;
  responsibleUserId?: string;
  overdue: boolean;
};

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskStatus = "OPEN" | "MITIGATED" | "RESOLVED" | "ACCEPTED";

export type Risk = {
  id: string;
  tenderId: string;
  title: string;
  description?: string;
  severity: RiskSeverity;
  source?: string;
  status: RiskStatus;
  mitigation?: string;
  assignedTo?: string;
  resolvedAt?: string;
};

export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";

export type Alert = {
  id: string;
  tenderId: string;
  type: string;
  severity: AlertSeverity;
  message: string;
  source?: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
};

export type StatusHistoryEntry = {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string;
  changedAt: string;
};

export type ReadinessStatus = "NOT_READY" | "IN_PROGRESS" | "READY_WITH_WARNINGS" | "READY";

export type ReadinessBreakdownEntry = {
  label: string;
  weight: number;
  achievedRatio: number;
  points: number;
};

export type Readiness = {
  score: number;
  status: ReadinessStatus;
  completedItems: number;
  remainingItems: number;
  criticalAlerts: number;
  warnings: number;
  breakdown: ReadinessBreakdownEntry[];
  disclaimer: string;
};

export type MyMembership = {
  id: string;
  role: string;
  status: string;
  organization: { id: string; name: string; slug: string };
};

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  DRAFT: "Brouillon",
  IN_ANALYSIS: "En analyse",
  READY: "Pret",
  IN_PREPARATION: "En preparation",
  READY_TO_SUBMIT: "Pret a soumettre",
  SUBMITTED: "Soumis",
  WON: "Gagne",
  LOST: "Perdu",
  ARCHIVED: "Archive",
};

export const ALLOWED_TENDER_TRANSITIONS: Record<TenderStatus, TenderStatus[]> = {
  DRAFT: ["IN_ANALYSIS", "ARCHIVED"],
  IN_ANALYSIS: ["READY", "DRAFT", "ARCHIVED"],
  READY: ["IN_PREPARATION", "IN_ANALYSIS", "ARCHIVED"],
  IN_PREPARATION: ["READY_TO_SUBMIT", "READY", "ARCHIVED"],
  READY_TO_SUBMIT: ["SUBMITTED", "IN_PREPARATION", "ARCHIVED"],
  SUBMITTED: ["WON", "LOST", "ARCHIVED"],
  WON: ["ARCHIVED"],
  LOST: ["ARCHIVED"],
  ARCHIVED: [],
};
