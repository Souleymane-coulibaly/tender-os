import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { computePricingControls, type ComputePricingControlsResult } from "../../domain/services/compute-pricing-controls";
import { PricingScheduleVersionNotFoundError } from "../../domain/errors";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type GetPricingScheduleControlsQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  /** Version précise à contrôler — jamais implicitement "la version courante" côté port (mission
   *  §8/§23) ; l'appelant HTTP transmet explicitement `PricingSchedule.currentVersionId` s'il veut
   *  la dernière. */
  pricingScheduleVersionId: string;
}>;

/** Lecture seule (mission — même motif que la couverture `TechnicalMemo`) : recalcule les contrôles
 *  à chaque appel, ne persiste jamais de statut "contrôlé" figé. */
@Injectable()
export class GetPricingScheduleControlsUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(query: GetPricingScheduleControlsQuery): Promise<ComputePricingControlsResult> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: query.organizationId,
      pricingScheduleId: query.pricingScheduleId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadPricingSchedule,
    });

    const version = await this.versionRepository.findById({ organizationId: query.organizationId, pricingScheduleVersionId: query.pricingScheduleVersionId });
    if (!version || version.pricingScheduleId !== schedule.id) {
      throw new PricingScheduleVersionNotFoundError();
    }

    const lines = await this.lineRepository.listByVersion({ organizationId: query.organizationId, pricingScheduleVersionId: version.id });
    return computePricingControls(lines);
  }
}
