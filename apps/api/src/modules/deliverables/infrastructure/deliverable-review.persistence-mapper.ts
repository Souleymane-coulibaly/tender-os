import { DeliverableReview } from "../domain/deliverable-review.entity";
import type { DeliverableReviewDecision } from "../domain/deliverable-review-decision";

export type PersistedDeliverableReview = {
  id: string;
  organizationId: string;
  deliverableRevisionId: string;
  decision: string;
  comment: string | null;
  decidedBy: string;
  decidedByRole: string;
  decidedAt: Date;
};

export function toDomainReview(record: PersistedDeliverableReview): DeliverableReview {
  return DeliverableReview.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableRevisionId: record.deliverableRevisionId,
    decision: record.decision as DeliverableReviewDecision,
    comment: record.comment ?? undefined,
    decidedBy: record.decidedBy,
    decidedByRole: record.decidedByRole,
    decidedAt: record.decidedAt,
  });
}

export function toReviewRow(review: DeliverableReview) {
  return {
    id: review.id,
    organizationId: review.organizationId,
    deliverableRevisionId: review.deliverableRevisionId,
    decision: review.decision,
    comment: review.comment ?? null,
    decidedBy: review.decidedBy,
    decidedByRole: review.decidedByRole,
    decidedAt: review.decidedAt,
  };
}
