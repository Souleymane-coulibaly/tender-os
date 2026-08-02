import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableRevision } from "../../domain/deliverable-revision.aggregate";
import { DeliverableRevisionSourceType } from "../../domain/deliverable-revision-source-type";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { toDeliverableRevisionSummary, type DeliverableRevisionSummary } from "../dtos";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type RestoreRevisionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  /** La révision (n'importe quel statut, y compris ARCHIVED/REJECTED) dont le contenu doit être
   *  repris. */
  sourceRevisionId: string;
}>;

/**
 * Mission Sprint 8A.1 §9 — "restaurer une ancienne version comme une NOUVELLE révision" : jamais un
 * retour en arrière destructif. La nouvelle révision chaîne sur la révision la plus récente de la
 * section (`previousRevisionId`), son CONTENU est copié depuis `sourceRevisionId` — celle-ci reste
 * elle-même intacte et immuable.
 */
@Injectable()
export class RestoreRevisionUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: RestoreRevisionCommand): Promise<DeliverableRevisionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });
    section.assertEditable();

    const source = await this.revisionRepository.findById({ organizationId: command.organizationId, revisionId: command.sourceRevisionId });
    if (!source || source.deliverableSectionId !== section.id) {
      throw new DeliverableRevisionNotFoundError();
    }

    const latest = await this.revisionRepository.findLatestBySection({ organizationId: command.organizationId, deliverableSectionId: section.id });
    const occurredAt = this.clock.now();
    const revisionNumber = await this.revisionRepository.nextRevisionNumber({ organizationId: command.organizationId, deliverableSectionId: section.id });

    const revision = DeliverableRevision.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableSectionId: section.id,
      revisionNumber,
      previousRevisionId: latest?.id ?? source.id,
      sourceType: DeliverableRevisionSourceType.Restored,
      content: source.contentStructured,
      createdBy: command.actorId,
      createdByRole: command.actorRole,
      occurredAt,
      changeNote: `Restauré depuis la révision #${source.revisionNumber}`,
    });

    await this.revisionRepository.create(revision);
    await this.statusRecalculation.recomputeSection({ organizationId: command.organizationId, deliverableSectionId: section.id, deliverableId: deliverable.id });

    return toDeliverableRevisionSummary(revision);
  }
}
