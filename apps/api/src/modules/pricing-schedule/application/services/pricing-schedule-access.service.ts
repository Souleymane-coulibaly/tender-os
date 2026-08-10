import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { PricingScheduleNotFoundError } from "../../domain/errors";
import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";

/**
 * Point d'entrée UNIQUE pour charger un PricingSchedule avec vérification RBAC + tenant + client —
 * même motif que `TechnicalMemoAccessService` (Sprint 12) : charge le Tender (org-tier déjà vérifié
 * par l'appelant via `assertPricingScheduleTenderAccess`) puis revérifie le ClientAccess AU MOMENT
 * DE LA REQUÊTE (mission — jamais seulement `createdBy === currentUser`, jamais un accès hérité
 * d'une vérification passée : si l'accès client a été révoqué depuis, le chiffrage devient
 * invisible même à son auteur).
 */
@Injectable()
export class PricingScheduleAccessService {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly pricingScheduleRepository: PricingScheduleRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async loadSchedule(input: {
    organizationId: string;
    actorId: string;
    actorRole: string;
    pricingScheduleId: string;
    permission: ClientPermission;
  }): Promise<PricingSchedule> {
    const schedule = await this.pricingScheduleRepository.findById({ organizationId: input.organizationId, pricingScheduleId: input.pricingScheduleId });
    if (!schedule) {
      throw new PricingScheduleNotFoundError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: schedule.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return schedule;
  }

  /** Vérifie l'accès au Tender SANS exiger qu'un chiffrage existe déjà — utilisé par
   *  `CreatePricingScheduleUseCase`/`ListPricingSchedulesUseCase`. */
  async assertTenderAccess(input: { organizationId: string; actorId: string; actorRole: string; tenderId: string; permission: ClientPermission }): Promise<string> {
    const tender = await this.getTenderUseCase.execute({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      actorId: input.actorId,
      actorRole: input.actorRole,
    });
    await this.assertClientAccessUseCase.execute({
      organizationId: input.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      permission: input.permission,
    });
    return tender.clientAccountId;
  }
}
