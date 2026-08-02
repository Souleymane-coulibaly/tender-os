import { DeliverableReviewDecision } from "./deliverable-review-decision";

export type DeliverableReviewProps = {
  id: string;
  organizationId: string;
  deliverableRevisionId: string;
  decision: DeliverableReviewDecision;
  comment?: string | undefined;
  decidedBy: string;
  decidedByRole: string;
  decidedAt: Date;
};

const MAX_COMMENT_LENGTH = 5000;

/**
 * Mission Sprint 8A.1 §13 — une décision de revue simple (pas de collaboration temps réel, "le
 * workflow collaboratif avancé reste réservé au Sprint 11"), toujours liée à une révision EXACTE.
 * Fait immuable, en ajout seul (append-only) : aucune méthode de mutation.
 */
export class DeliverableReview {
  private constructor(private readonly props: DeliverableReviewProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableRevisionId: string;
    decision: DeliverableReviewDecision;
    comment?: string | undefined;
    decidedBy: string;
    decidedByRole: string;
    occurredAt: Date;
  }): DeliverableReview {
    if (input.comment !== undefined && input.comment.length > MAX_COMMENT_LENGTH) {
      throw new Error(`comment must not exceed ${MAX_COMMENT_LENGTH} characters`);
    }
    return new DeliverableReview({
      id: input.id,
      organizationId: input.organizationId,
      deliverableRevisionId: input.deliverableRevisionId,
      decision: input.decision,
      comment: input.comment,
      decidedBy: input.decidedBy,
      decidedByRole: input.decidedByRole,
      decidedAt: input.occurredAt,
    });
  }

  static rehydrate(props: DeliverableReviewProps): DeliverableReview {
    return new DeliverableReview(props);
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableRevisionId(): string {
    return this.props.deliverableRevisionId;
  }
  get decision(): DeliverableReviewDecision {
    return this.props.decision;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get decidedBy(): string {
    return this.props.decidedBy;
  }
  get decidedByRole(): string {
    return this.props.decidedByRole;
  }
  get decidedAt(): Date {
    return this.props.decidedAt;
  }
}
