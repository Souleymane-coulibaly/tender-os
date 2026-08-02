import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableExportSelection } from "../../domain/deliverable-export-selection.entity";
import { DeliverableRevisionNotFoundError } from "../../domain/errors";
import { DELIVERABLE_EXPORT_SELECTION_REPOSITORY, type DeliverableExportSelectionRepository } from "../ports/deliverable-export-selection.repository";
import { DELIVERABLE_REVISION_REPOSITORY, type DeliverableRevisionRepository } from "../ports/deliverable-revision.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";

export type SelectRevisionForExportCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  revisionId: string;
  justification?: string | undefined;
}>;

/**
 * Mission Sprint 8A.1 §11 — "règle absolue" : seule une révision VALIDÉE peut être sélectionnée
 * pour l'export (appliqué par le domaine, `DeliverableExportSelection.create`, jamais seulement
 * ici). Permission `Selon politique` (mission §17), mappée sur `ValidateDeliverable` — même palier
 * que la décision de revue elle-même.
 */
@Injectable()
export class SelectRevisionForExportUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REVISION_REPOSITORY) private readonly revisionRepository: DeliverableRevisionRepository,
    @Inject(DELIVERABLE_EXPORT_SELECTION_REPOSITORY) private readonly selectionRepository: DeliverableExportSelectionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: SelectRevisionForExportCommand): Promise<void> {
    const { section } = await this.accessService.loadSectionContext({
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

    const selection = DeliverableExportSelection.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      deliverableSectionId: section.id,
      revision,
      selectedBy: command.actorId,
      justification: command.justification,
      occurredAt: this.clock.now(),
    });

    await this.selectionRepository.upsert(selection);
  }
}
