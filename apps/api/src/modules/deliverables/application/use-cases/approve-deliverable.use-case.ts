import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { DeliverableSectionStatus } from "../../domain/deliverable-section-status";
import { isStructuredDeliverableType } from "../../domain/deliverable-type";
import { DeliverableNotReadyForApprovalError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";
import { toDeliverableSummary, type DeliverableSummary } from "../dtos";
import { DELIVERABLE_SECTION_REPOSITORY, type DeliverableSectionRepository } from "../ports/deliverable-section.repository";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";
import { DeliverableStatusRecalculationService } from "../services/deliverable-status-recalculation.service";

export type ApproveDeliverableCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
}>;

/**
 * Mission Sprint 8A.1 §15 — APPROVED est un fait explicite, jamais déduit automatiquement des
 * sections : n'est déclenché que par cette action, et seulement quand toutes les sections visibles
 * (les masquées ne comptent pas, mission §15) sont VALIDÉES. Réservé aux livrables structurés
 * (Mémoire technique/Synthèse exécutive) — les autres n'ont pas de sections à valider.
 */
@Injectable()
export class ApproveDeliverableUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    @Inject(DELIVERABLE_SECTION_REPOSITORY) private readonly sectionRepository: DeliverableSectionRepository,
    private readonly statusRecalculation: DeliverableStatusRecalculationService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ApproveDeliverableCommand): Promise<DeliverableSummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ValidateDeliverable,
    });

    if (!isStructuredDeliverableType(deliverable.type)) {
      throw new UnsupportedReadOnlyDeliverableError("only a structured deliverable (technical memo/executive summary) can be approved");
    }

    const sections = await this.sectionRepository.listByDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });
    const visible = sections.filter((s) => !s.hidden);
    const allValidated = visible.length > 0 && visible.every((s) => s.status === DeliverableSectionStatus.Validated);
    if (!allValidated) {
      throw new DeliverableNotReadyForApprovalError();
    }

    const occurredAt = this.clock.now();
    deliverable.markApproved({ approvedBy: command.actorId, occurredAt });
    await this.deliverableRepository.save(deliverable);

    await this.statusRecalculation.recomputeDeliverable({ organizationId: command.organizationId, deliverableId: deliverable.id });

    const refreshed = await this.deliverableRepository.findById({ organizationId: command.organizationId, deliverableId: deliverable.id });
    return toDeliverableSummary(refreshed ?? deliverable);
  }
}
