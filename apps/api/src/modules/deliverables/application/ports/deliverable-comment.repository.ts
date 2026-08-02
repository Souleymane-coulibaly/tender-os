import type { DeliverableComment } from "../../domain/deliverable-comment.entity";

export interface DeliverableCommentRepository {
  create(comment: DeliverableComment): Promise<void>;
  findById(input: { organizationId: string; commentId: string }): Promise<DeliverableComment | null>;
  listByDeliverable(input: { organizationId: string; deliverableId: string }): Promise<readonly DeliverableComment[]>;
  save(comment: DeliverableComment): Promise<void>;
}

export const DELIVERABLE_COMMENT_REPOSITORY = Symbol("DELIVERABLE_COMMENT_REPOSITORY");
