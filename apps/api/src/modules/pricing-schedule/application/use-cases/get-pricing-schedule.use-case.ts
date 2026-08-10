import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import type { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import type { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";
import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type GetPricingScheduleQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  /** Si fourni, charge aussi les lignes de CETTE version précise (jamais implicitement "la
   *  courante" côté port — voir `ExtractPricingScheduleVersionUseCase`). */
  pricingScheduleVersionId?: string | undefined;
}>;

export type GetPricingScheduleResult = Readonly<{
  schedule: PricingSchedule;
  versions: readonly PricingScheduleVersion[];
  lines: readonly PricingScheduleLine[];
}>;

/** Lecture — revérifie le ClientAccess À CHAQUE APPEL (même motif que `TechnicalMemoAccessService`),
 *  jamais un accès mis en cache ni seulement `createdBy === currentUser`. */
@Injectable()
export class GetPricingScheduleUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(query: GetPricingScheduleQuery): Promise<GetPricingScheduleResult> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: query.organizationId,
      pricingScheduleId: query.pricingScheduleId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadPricingSchedule,
    });

    const versions = await this.versionRepository.list({ organizationId: query.organizationId, pricingScheduleId: schedule.id });

    let lines: readonly PricingScheduleLine[] = [];
    if (query.pricingScheduleVersionId) {
      const targetVersion = versions.find((v) => v.id === query.pricingScheduleVersionId);
      if (targetVersion) {
        lines = await this.lineRepository.listByVersion({ organizationId: query.organizationId, pricingScheduleVersionId: targetVersion.id });
      }
    }

    return { schedule, versions, lines };
  }
}
