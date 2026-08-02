import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ClientPermission } from "../../../client-portfolio";
import { GetPricingEstimateUseCase } from "../../../pricing";
import { DeliverableType } from "../../domain/deliverable-type";
import { CrossClientDeliverableContentError, UnsupportedReadOnlyDeliverableError } from "../../domain/errors";
import { toDeliverableSummary, type DeliverableSummary } from "../dtos";
import { DELIVERABLE_REPOSITORY, type DeliverableRepository } from "../ports/deliverable.repository";
import { DeliverableAccessService } from "../services/deliverable-access.service";

export type SelectCostReportEstimateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  deliverableId: string;
  pricingEstimateId: string;
  versionNumber: number;
}>;

/**
 * Correctif audit Codex P1-002 — "le rapport financier doit référencer explicitement une version
 * figée du Sprint 7" : seul point d'entrée qui fige la référence pricing d'un livrable COST_REPORT.
 * Réutilise `GetPricingEstimateUseCase` (jamais une seconde lecture directe de la table pricing)
 * pour vérifier que l'estimation ET la version demandée existent réellement, sont accessibles à
 * l'acteur, et appartiennent au même Tender — jamais une référence à une estimation d'un autre
 * Tender figée par erreur. Une fois posée, la référence est immuable (voir
 * `Deliverable.selectCostReportEstimate`).
 */
@Injectable()
export class SelectCostReportEstimateUseCase {
  constructor(
    private readonly accessService: DeliverableAccessService,
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverableRepository: DeliverableRepository,
    private readonly getPricingEstimateUseCase: GetPricingEstimateUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SelectCostReportEstimateCommand): Promise<DeliverableSummary> {
    const { deliverable } = await this.accessService.loadDeliverable({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      deliverableId: command.deliverableId,
      permission: ClientPermission.ManageDeliverable,
    });

    if (deliverable.type !== DeliverableType.CostReport) {
      throw new UnsupportedReadOnlyDeliverableError("only a COST_REPORT deliverable can have a frozen pricing estimate selected");
    }

    // Vérifie que l'estimation ET la version demandée existent réellement, sont accessibles à
    // l'acteur (RBAC/tenant/client déjà appliqués par ce use case), jamais une seconde lecture
    // directe de la table pricing.
    const estimate = await this.getPricingEstimateUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      estimateId: command.pricingEstimateId,
      version: command.versionNumber,
    });
    if (estimate.tenderId && estimate.tenderId !== deliverable.tenderId) {
      throw new CrossClientDeliverableContentError();
    }

    const occurredAt = this.clock.now();
    deliverable.selectCostReportEstimate({
      pricingEstimateId: command.pricingEstimateId,
      versionNumber: command.versionNumber,
      selectedBy: command.actorId,
      occurredAt,
    });
    await this.deliverableRepository.save(deliverable);

    return toDeliverableSummary(deliverable);
  }
}
