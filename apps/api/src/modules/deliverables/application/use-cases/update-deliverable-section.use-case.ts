import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { toDeliverableSectionSummary, type DeliverableSectionSummary } from "../dtos";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type UpdateDeliverableSectionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableSectionId: string;
  locked?: boolean | undefined;
  hidden?: boolean | undefined;
}>;

/**
 * Mission Sprint 8A.1 §4 — une section « peut être… masquée, verrouillée » : verrouiller bloque
 * toute nouvelle révision/édition (`assertEditable()`, déjà appliqué par la chaîne
 * génération/édition) ; masquer l'exclut du calcul du statut global et du contenu final assemblé
 * (mission §15 "les sections masquées ne comptent jamais dans le calcul global"). Chaque champ est
 * optionnel et appliqué indépendamment — un appel peut ne changer que l'un des deux.
 */
@Injectable()
export class UpdateDeliverableSectionUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateDeliverableSectionCommand): Promise<DeliverableSectionSummary> {
    const { section, deliverable } = await this.accessService.loadSectionContext({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableSectionId: command.deliverableSectionId,
      permission: ClientPermission.ManageDeliverable,
    });

    const occurredAt = this.clock.now();
    if (command.locked === true) section.lock(occurredAt);
    if (command.locked === false) section.unlock(occurredAt);
    if (command.hidden === true) section.hide(occurredAt);
    if (command.hidden === false) section.show(occurredAt);

    await this.sectionRepository.save(section);

    if (command.hidden !== undefined) {
      await this.statusRecalculation.recomputeDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    }

    return toDeliverableSectionSummary(section);
  }
}
