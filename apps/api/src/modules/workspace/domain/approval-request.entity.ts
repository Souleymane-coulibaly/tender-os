import { ApprovalRequestAlreadyReviewedError } from "./errors";

/** V2 Sprint 7 §26-30 — scope volontairement restreint (document/livrable/export gardent leurs
 *  propres mécanismes, `FinalApproval`/`DeliverableReview`, jamais dupliqués). */
export const ApprovalEntityType = {
  Task: "TASK",
  ChecklistItem: "CHECKLIST_ITEM",
} as const;
export type ApprovalEntityType = (typeof ApprovalEntityType)[keyof typeof ApprovalEntityType];

/** V2 Sprint 7 §27 — vocabulaire CHANGES_REQUESTED, jamais REJECTED (mission : "adapter au
 *  vocabulaire métier"). */
export const ApprovalStatus = {
  Pending: "PENDING",
  Approved: "APPROVED",
  ChangesRequested: "CHANGES_REQUESTED",
  Cancelled: "CANCELLED",
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export type ApprovalRequestProps = {
  id: string;
  organizationId: string;
  tenderId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  requestedBy: string;
  reviewerId: string;
  status: ApprovalStatus;
  comment?: string | undefined;
  requestedAt: Date;
  reviewedAt?: Date | undefined;
};

/** V2 Sprint 7 §26-30 — validation collaborative INTERNE ("cette personne a validé cette étape de
 *  travail"), JAMAIS une signature juridique/un engagement contractuel/une validation officielle de
 *  l'offre (mission §28, règle absolue). `requestedBy === reviewerId` (auto-validation) est refusé
 *  par l'APPELANT (`RequestApprovalUseCase`), jamais ici — le domaine reste sans dépendance I/O et
 *  ne connaît pas l'identité de l'acteur courant au moment de la construction. Idempotence : une
 *  fois `APPROVED`/`CHANGES_REQUESTED`/`CANCELLED`, plus aucune transition n'est permise (mission
 *  §48 "double approval" — protège contre une double revue concurrente une fois la première
 *  committée). */
export class ApprovalRequest {
  private constructor(private props: ApprovalRequestProps) {}

  static create(input: {
    id: string;
    organizationId: string;
    tenderId: string;
    entityType: ApprovalEntityType;
    entityId: string;
    requestedBy: string;
    reviewerId: string;
    comment?: string | undefined;
    occurredAt: Date;
  }): ApprovalRequest {
    return new ApprovalRequest({
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      entityType: input.entityType,
      entityId: input.entityId,
      requestedBy: input.requestedBy,
      reviewerId: input.reviewerId,
      status: ApprovalStatus.Pending,
      comment: input.comment,
      requestedAt: input.occurredAt,
      reviewedAt: undefined,
    });
  }

  static rehydrate(props: ApprovalRequestProps): ApprovalRequest {
    return new ApprovalRequest(props);
  }

  private assertPending(): void {
    if (this.props.status !== ApprovalStatus.Pending) {
      throw new ApprovalRequestAlreadyReviewedError();
    }
  }

  approve(reviewComment: string | undefined, occurredAt: Date): void {
    this.assertPending();
    this.props.status = ApprovalStatus.Approved;
    if (reviewComment !== undefined) this.props.comment = reviewComment;
    this.props.reviewedAt = occurredAt;
  }

  requestChanges(reviewComment: string | undefined, occurredAt: Date): void {
    this.assertPending();
    this.props.status = ApprovalStatus.ChangesRequested;
    if (reviewComment !== undefined) this.props.comment = reviewComment;
    this.props.reviewedAt = occurredAt;
  }

  cancel(occurredAt: Date): void {
    this.assertPending();
    this.props.status = ApprovalStatus.Cancelled;
    this.props.reviewedAt = occurredAt;
  }

  get id(): string {
    return this.props.id;
  }
  get organizationId(): string {
    return this.props.organizationId;
  }
  get tenderId(): string {
    return this.props.tenderId;
  }
  get entityType(): ApprovalEntityType {
    return this.props.entityType;
  }
  get entityId(): string {
    return this.props.entityId;
  }
  get requestedBy(): string {
    return this.props.requestedBy;
  }
  get reviewerId(): string {
    return this.props.reviewerId;
  }
  get status(): ApprovalStatus {
    return this.props.status;
  }
  get comment(): string | undefined {
    return this.props.comment;
  }
  get requestedAt(): Date {
    return this.props.requestedAt;
  }
  get reviewedAt(): Date | undefined {
    return this.props.reviewedAt;
  }
}
