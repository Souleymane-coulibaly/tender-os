import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableRevision } from "../../domain/deliverable-revision.aggregate";
import { DeliverableRevisionSourceType } from "../../domain/deliverable-revision-source-type";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type CreateManualRevisionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  content: unknown;
  changeNote?: string | undefined;
}>;

/** Mission Sprint 8A.1 §9 — "rédiger entièrement manuellement" : première révision (ou nouvelle
 *  révision) sans passer par la génération IA. */
@Injectable()
export class CreateManualRevisionUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateManualRevisionCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    section.assertEditable();

    const occurredAt = this.clock.now();
    const revisionNumber = await this.revisionRepository.nextRevisionNumber({ organizationId: command.organizationId, deliverableSectionId: section.id });

    const revision = DeliverableRevision.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableSectionId: section.id,
      revisionNumber,
      sourceType: DeliverableRevisionSourceType.Manual,
      content: command.content,
      createdBy: command.actorId,
      createdByRole: command.actorRole,
      occurredAt,
      changeNote: command.changeNote,
    });

    await this.revisionRepository.create(revision);
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });

    return toDeliverableRevisionSummary(revision);
  }
}
