import { DeliverableCommentStatus } from "./deliverable-comment-status";
import { DeliverableCommentAlreadyResolvedError } from "./errors";

export type DeliverableCommentProps = {
  id: string;
  organizationId: string;
  deliverableId: string;
  deliverableSectionId?: string | undefined;
  deliverableRevisionId?: string | undefined;
  content: string;
  authorId: string;
  createdAt: Date;
  status: DeliverableCommentStatus;
  resolvedBy?: string | undefined;
  resolvedAt?: Date | undefined;
};

const MAX_CONTENT_LENGTH = 5000;

/** Mission §13 — commentaire simple lié à un livrable/une section/une révision, avec un statut
 *  ouvert/résolu (jamais de fil de discussion imbriqué, jamais temps réel). */
export class DeliverableComment {
  private constructor(private props: DeliverableCommentProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    deliverableId: string;
    deliverableSectionId?: string | undefined;
    deliverableRevisionId?: string | undefined;
    content: string;
    authorId: string;
    occurredAt: Date;
  }): DeliverableComment {
    const content = input.content.trim();
    if (!content || content.length > MAX_CONTENT_LENGTH) {
      throw new Error(`content must be between 1 and ${MAX_CONTENT_LENGTH} characters`);
    }
    return new DeliverableComment({
      id: input.id,
      organizationId: input.organizationId,
      deliverableId: input.deliverableId,
      deliverableSectionId: input.deliverableSectionId,
      deliverableRevisionId: input.deliverableRevisionId,
      content,
      authorId: input.authorId,
      createdAt: input.occurredAt,
      status: DeliverableCommentStatus.Open,
    });
  }

  static rehydrate(props: DeliverableCommentProps): DeliverableComment {
    return new DeliverableComment(props);
  }

  resolve(input: { resolvedBy: string; occurredAt: Date }): void {
    if (this.props.status === DeliverableCommentStatus.Resolved) {
      throw new DeliverableCommentAlreadyResolvedError();
    }
    this.props.status = DeliverableCommentStatus.Resolved;
    this.props.resolvedBy = input.resolvedBy;
    this.props.resolvedAt = input.occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get deliverableId(): string {
    return this.props.deliverableId;
  }
  get deliverableSectionId(): string | undefined {
    return this.props.deliverableSectionId;
  }
  get deliverableRevisionId(): string | undefined {
    return this.props.deliverableRevisionId;
  }
  get content(): string {
    return this.props.content;
  }
  get authorId(): string {
    return this.props.authorId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get status(): DeliverableCommentStatus {
    return this.props.status;
  }
  get resolvedBy(): string | undefined {
    return this.props.resolvedBy;
  }
  get resolvedAt(): Date | undefined {
    return this.props.resolvedAt;
  }
}
