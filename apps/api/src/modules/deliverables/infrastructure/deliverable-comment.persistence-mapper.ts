import { DeliverableComment } from "../domain/deliverable-comment.entity";
import type { DeliverableCommentStatus } from "../domain/deliverable-comment-status";

export type PersistedDeliverableComment = {
  id: string;
  organizationId: string;
  deliverableId: string;
  deliverableSectionId: string | null;
  deliverableRevisionId: string | null;
  content: string;
  authorId: string;
  createdAt: Date;
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | null;
};

export function toDomainComment(record: PersistedDeliverableComment): DeliverableComment {
  return DeliverableComment.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableId: record.deliverableId,
    deliverableSectionId: record.deliverableSectionId ?? undefined,
    deliverableRevisionId: record.deliverableRevisionId ?? undefined,
    content: record.content,
    authorId: record.authorId,
    createdAt: record.createdAt,
    status: record.status as DeliverableCommentStatus,
    resolvedBy: record.resolvedBy ?? undefined,
    resolvedAt: record.resolvedAt ?? undefined,
  });
}

export function toCommentRow(comment: DeliverableComment) {
  return {
    id: comment.id,
    organizationId: comment.organizationId,
    deliverableId: comment.deliverableId,
    deliverableSectionId: comment.deliverableSectionId ?? null,
    deliverableRevisionId: comment.deliverableRevisionId ?? null,
    content: comment.content,
    authorId: comment.authorId,
    createdAt: comment.createdAt,
    status: comment.status,
    resolvedBy: comment.resolvedBy ?? null,
    resolvedAt: comment.resolvedAt ?? null,
  };
}
