import type { DeliverableReview } from "../../domain/deliverable-review.entity";

export interface DeliverableReviewRepository {
  create(review: DeliverableReview): Promise<void>;
  listByRevision(input: { organizationId: string; deliverableRevisionId: string }): Promise<readonly DeliverableReview[]>;
}

export const DELIVERABLE_REVIEW_REPOSITORY = Symbol("DELIVERABLE_REVIEW_REPOSITORY");
