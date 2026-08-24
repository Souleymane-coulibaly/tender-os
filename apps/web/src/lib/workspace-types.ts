export type TenderCollaborativeRole = "TENDER_MANAGER" | "ADMINISTRATIVE_RESPONSIBLE" | "TECHNICAL_WRITER" | "FINANCIAL_RESPONSIBLE" | "REVIEWER" | "SIGNATORY" | "VIEWER";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CommentEntityType = "TENDER" | "TASK" | "CHECKLIST_ITEM" | "LOT";
/** V2 Sprint 18 (mission §24-31) — les trois cibles documentaires ciblent une VERSION déjà
 *  immuable (une révision de section mémoire technique, ou une version Pricing/ResponsePackage déjà
 *  VALIDATED), jamais "latest". */
export type ApprovalEntityType = "TASK" | "CHECKLIST_ITEM" | "TECHNICAL_MEMO_SECTION_REVISION" | "PRICING_SCHEDULE_VERSION" | "RESPONSE_PACKAGE_VERSION";
/** V2 Sprint 18 (mission §27/§34) — REJECTED ajouté, distinct de CHANGES_REQUESTED. */
export type ApprovalStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED" | "CANCELLED";

export type TenderParticipant = {
  id: string;
  tenderId: string;
  userId: string;
  role: TenderCollaborativeRole;
  addedBy: string;
  addedAt: string;
  removedBy?: string;
  removedAt?: string;
};

export type Task = {
  id: string;
  tenderId: string;
  lotId?: string;
  checklistItemId?: string;
  documentId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  assigneeId?: string;
  createdBy: string;
  completedBy?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  tenderId: string;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
  mentionedUserIds: string[];
};

export type ApprovalRequest = {
  id: string;
  tenderId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  requestedBy: string;
  reviewerId: string;
  status: ApprovalStatus;
  comment?: string;
  requestedAt: string;
  reviewedAt?: string;
};

export type TenderActivityItem = {
  id: string;
  tenderId: string;
  actorId: string;
  type: string;
  summary: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type TenderActivityPage = { items: TenderActivityItem[]; nextCursor: string | null };

export const TENDER_COLLABORATIVE_ROLE_LABELS: Record<TenderCollaborativeRole, string> = {
  TENDER_MANAGER: "Responsable du dossier",
  ADMINISTRATIVE_RESPONSIBLE: "Responsable administratif",
  TECHNICAL_WRITER: "Rédacteur technique",
  FINANCIAL_RESPONSIBLE: "Responsable financier",
  REVIEWER: "Relecteur",
  SIGNATORY: "Signataire",
  VIEWER: "Observateur",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  BLOCKED: "Bloquée",
  IN_REVIEW: "En relecture",
  DONE: "Terminée",
  CANCELLED: "Annulée",
};

/** Même palier que `TenderPermission.ManageWorkspace` (backend) — gate d'affichage UNIQUEMENT,
 *  jamais une autorité : chaque mutation reste revalidée côté API (mission §41). Checkpoint
 *  TENDEROS-2.1-P2.3-E6 — source canonique ; `dashboard-permissions.ts` ré-exporte cette même
 *  fonction (audit §12/§42 : deux définitions indépendantes et identiques trouvées). */
const ROLES_ALLOWED_TO_MANAGE_WORKSPACE = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR"];
export function canManageWorkspace(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_MANAGE_WORKSPACE.includes(role);
}

/** Même palier que `TenderPermission.ValidateWorkspace` — jamais CONTRIBUTOR (mission §29/§41). */
const ROLES_ALLOWED_TO_VALIDATE_WORKSPACE = ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"];
export function canValidateWorkspaceOrgTier(role: string | undefined): boolean {
  return role !== undefined && ROLES_ALLOWED_TO_VALIDATE_WORKSPACE.includes(role);
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "En attente de validation",
  APPROVED: "Validé",
  CHANGES_REQUESTED: "Modifications demandées",
  REJECTED: "Rejeté",
  CANCELLED: "Annulée",
};

export const APPROVAL_ENTITY_TYPE_LABELS: Record<ApprovalEntityType, string> = {
  TASK: "Tâche",
  CHECKLIST_ITEM: "Élément de checklist",
  TECHNICAL_MEMO_SECTION_REVISION: "Section de mémoire technique",
  PRICING_SCHEDULE_VERSION: "Chiffrage",
  RESPONSE_PACKAGE_VERSION: "Dossier de réponse",
};
