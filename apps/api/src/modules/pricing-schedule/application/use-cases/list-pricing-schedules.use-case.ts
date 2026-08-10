import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { TENDER_LOT_REPOSITORY, assertLotBelongsToTender, type TenderLotRepository } from "../../../tenders";
import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { assertPricingScheduleTenderAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";

export type ListPricingSchedulesQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  /** Filtre optionnel — omis : tous les chiffrages du Tender, tous lots confondus (mission "un lot
   *  peut avoir plusieurs fichiers financiers simultanément" — jamais un seul par lot). */
  lotId?: string | undefined;
}>;

/** Liste les chiffrages détectés/déclarés pour un Tender (mission — onglet "Chiffrage", section
 *  "fichiers détectés") — jamais scopé à un seul type de document, un Tender/lot peut avoir un BPU,
 *  un DPGF et un DQE simultanément. */
@Injectable()
export class ListPricingSchedulesUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(query: ListPricingSchedulesQuery): Promise<readonly PricingSchedule[]> {
    const clientAccountId = await assertPricingScheduleTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadPricingSchedule,
    });

    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: query.organizationId, tenderId: query.tenderId, lotId: query.lotId });

    return this.scheduleRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, lotId: query.lotId, clientAccountId });
  }
}
