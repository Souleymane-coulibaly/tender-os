import type { ApprovalEntityType, ApprovalRequest, ApprovalStatus } from "../domain/approval-request.entity";
import type { Comment, CommentEntityType } from "../domain/comment.entity";
import type { Mention } from "../domain/mention.entity";
import type { Task, TaskPriority, TaskStatus } from "../domain/task.entity";
import type { TenderCollaborativeRole, TenderParticipant } from "../domain/tender-participant.entity";

export type TenderParticipantSummary = {
  id: string;
  tenderId: string;
  userId: string;
  role: TenderCollaborativeRole;
  addedBy: string;
  addedAt: string;
  removedBy?: string | undefined;
  removedAt?: string | undefined;
};

export function toTenderParticipantSummary(participant: TenderParticipant): TenderParticipantSummary {
  return {
    id: participant.id,
    tenderId: participant.tenderId,
    userId: participant.userId,
    role: participant.role,
    addedBy: participant.addedBy,
    addedAt: participant.addedAt.toISOString(),
    removedBy: participant.removedBy,
    removedAt: participant.removedAt?.toISOString(),
  };
}

export type TaskSummary = {
  id: string;
  tenderId: string;
  lotId?: string | undefined;
  checklistItemId?: string | undefined;
  documentId?: string | undefined;
  title: string;
  description?: string | undefined;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | undefined;
  assigneeId?: string | undefined;
  createdBy: string;
  completedBy?: string | undefined;
  completedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toTaskSummary(task: Task): TaskSummary {
  return {
    id: task.id,
    tenderId: task.tenderId,
    lotId: task.lotId,
    checklistItemId: task.checklistItemId,
    documentId: task.documentId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString(),
    assigneeId: task.assigneeId,
    createdBy: task.createdBy,
    completedBy: task.completedBy,
    completedAt: task.completedAt?.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export type CommentSummary = {
  id: string;
  tenderId: string;
  entityType: CommentEntityType;
  entityId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt?: string | undefined;
  deletedAt?: string | undefined;
  mentionedUserIds: string[];
};

export function toCommentSummary(comment: Comment, mentions: readonly Mention[]): CommentSummary {
  return {
    id: comment.id,
    tenderId: comment.tenderId,
    entityType: comment.entityType,
    entityId: comment.entityId,
    authorId: comment.authorId,
    // Un commentaire supprimé (soft delete) ne révèle jamais son contenu, même à un lecteur
    // autorisé — mission §21 "préférer soft delete", cohérent avec l'esprit "jamais un contenu
    // sensible" (§33) appliqué ici à la suppression elle-même.
    body: comment.isDeleted ? "" : comment.body,
    createdAt: comment.createdAt.toISOString(),
    editedAt: comment.editedAt?.toISOString(),
    deletedAt: comment.deletedAt?.toISOString(),
    mentionedUserIds: mentions.map((mention) => mention.mentionedUserId),
  };
}

export type ApprovalRequestSummary = {
  id: string;
  tenderId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  requestedBy: string;
  reviewerId: string;
  status: ApprovalStatus;
  comment?: string | undefined;
  requestedAt: string;
  reviewedAt?: string | undefined;
};

export function toApprovalRequestSummary(approval: ApprovalRequest): ApprovalRequestSummary {
  return {
    id: approval.id,
    tenderId: approval.tenderId,
    entityType: approval.entityType,
    entityId: approval.entityId,
    requestedBy: approval.requestedBy,
    reviewerId: approval.reviewerId,
    status: approval.status,
    comment: approval.comment,
    requestedAt: approval.requestedAt.toISOString(),
    reviewedAt: approval.reviewedAt?.toISOString(),
  };
}
