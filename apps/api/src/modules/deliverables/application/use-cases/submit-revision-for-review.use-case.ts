import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type SubmitRevisionForReviewCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; deliverableSectionId: string; revisionId: string }>;
export type WithdrawRevisionFromReviewCommand = SubmitRevisionForReviewCommand;

@Injectable()
export class SubmitRevisionForReviewUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SubmitRevisionForReviewCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }
    revision.submitForReview(this.clock.now());
    await this.revisionRepository.save(revision);
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });
    return toDeliverableRevisionSummary(revision);
  }
}

@Injectable()
export class WithdrawRevisionFromReviewUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: WithdrawRevisionFromReviewCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    const revision = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.revisionId });
    if (!revision || revision.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }
    revision.withdrawFromReview(this.clock.now());
    await this.revisionRepository.save(revision);
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });
    return toDeliverableRevisionSummary(revision);
  }
}
