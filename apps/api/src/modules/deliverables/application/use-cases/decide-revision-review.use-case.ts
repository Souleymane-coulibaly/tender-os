import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableReview } from "../../domain/deliverable-review.entity";
import { DeliverableReviewDecision } from "../../domain/deliverable-review-decision";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { toDeliverableReviewSummary, type DeliverableReviewSummary } from "../dtos";
import { DELIVERABLE_REVIEW_REPOSITORY, type DeliverableReviewRepository } from "../ports/deliverable-review.repository";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type DecideRevisionReviewCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  revisionId: string;
  decision: DeliverableReviewDecision;
  comment?: string | undefined;
}>;

/**
 * Mission Sprint 8A.1 §13 — décision de revue simple, toujours liée à une révision EXACTE
 * (`READY_FOR_REVIEW` uniquement — la transition du domaine refuse toute autre origine). Permission
 * `ValidateDeliverable` (mission §17 "Valider : selon politique", même palier qu'`ApproveExport`).
 */
@Injectable()
export class DecideRevisionReviewUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    @Inject(DELIVERABLE_REVIEW_REPOSITORY) private readonly reviewRepository: DeliverableReviewRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: DecideRevisionReviewCommand): Promise<DeliverableReviewSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ValidateDeliverable,
    });

    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }

    const occurredAt = this.clock.now();
    if (command.decision === DeliverableReviewDecision.Approved) {
      revision.validate(occurredAt);
    } else if (command.decision === DeliverableReviewDecision.ChangesRequested) {
      revision.requestChanges(occurredAt);
    } else {
      revision.reject(occurredAt);
    }
    await this.revisionRepository.save(revision);

    const review = DeliverableReview.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableRevisionId: revision.id,
      decision: command.decision,
      comment: command.comment,
      decidedBy: command.actorId,
      decidedByRole: command.actorRole,
      occurredAt,
    });
    await this.reviewRepository.create(review);

    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });

    return toDeliverableReviewSummary(review);
  }
}
