import { Inject, Injectable } from "@nestjs/common";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type PricingScheduleVersionTenderRef = Readonly<{ versionId: string; pricingScheduleId: string; tenderId: string; status: string }>;

/** V2 Sprint 18 — réexporté UNIQUEMENT pour `workspace` (mission §25/§26 : une ApprovalRequest
 *  ciblant PRICING_SCHEDULE_VERSION doit vérifier que cette version appartient bien au Tender de la
 *  demande ET connaître son statut (`RequestApprovalUseCase` exige VALIDATED, décision
 *  AskUserQuestion "version précise, jamais latest") AVANT toute écriture. Lecture pure, aucune
 *  vérification de permission ici (déjà portée par `ManageWorkspace`/`ValidateWorkspace` côté
 *  workspace). */
@Injectable()
export class GetVersionTenderRefForApprovalUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
  ) {}

  async execute(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<PricingScheduleVersionTenderRef | null> {
    const version = await this.versionRepository.findById({ organizationId: input.organizationId, pricingScheduleVersionId: input.pricingScheduleVersionId });
    if (!version) return null;
    const schedule = await this.scheduleRepository.findById({ organizationId: input.organizationId, pricingScheduleId: version.pricingScheduleId });
    if (!schedule) return null;
    return { versionId: version.id, pricingScheduleId: schedule.id, tenderId: schedule.tenderId, status: version.status };
  }
}
