import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { matchBpuDqeCoherence, type BpuDqeCoherenceFinding } from "../../domain/services/match-bpu-dqe-coherence";
import { FinancialDocumentType } from "../../domain/enums";
import { PricingScheduleVersionNotFoundError } from "../../domain/errors";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type GetBpuDqeCoherenceQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleVersionId: string;
}>;

const OPPOSITE_TYPE: Partial<Record<FinancialDocumentType, FinancialDocumentType>> = {
  [FinancialDocumentType.Bpu]: FinancialDocumentType.Dqe,
  [FinancialDocumentType.Dqe]: FinancialDocumentType.Bpu,
};

/**
 * Rapprochement BPU↔DQE (mission §38) sur le PÉRIMÈTRE du chiffrage demandé — jamais tous les
 * chiffrages de l'organisation : ne compare qu'aux chiffrages FRÈRES (même Tender/lot/candidate,
 * mission §69 "jamais mélanger deux candidats"), et uniquement de type OPPOSÉ (BPU compare
 * uniquement à DQE et inversement — DPGF/OTHER_FINANCIAL_SCHEDULE ne sont jamais comparés ici, la
 * mission ne documente ce rapprochement qu'entre BPU et DQE).
 */
@Injectable()
export class GetBpuDqeCoherenceUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(query: GetBpuDqeCoherenceQuery): Promise<readonly BpuDqeCoherenceFinding[]> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: query.organizationId,
      pricingScheduleId: query.pricingScheduleId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadPricingSchedule,
    });

    const oppositeType = OPPOSITE_TYPE[schedule.financialDocumentType];
    if (!oppositeType) return [];

    const primaryVersion = await this.versionRepository.findById({ organizationId: query.organizationId, pricingScheduleVersionId: query.pricingScheduleVersionId });
    if (!primaryVersion || primaryVersion.pricingScheduleId !== schedule.id) {
      throw new PricingScheduleVersionNotFoundError();
    }
    const primaryLines = await this.lineRepository.listByVersion({ organizationId: query.organizationId, pricingScheduleVersionId: primaryVersion.id });

    // `lotId` volontairement NON transmis au port `list` (qui l'interprète comme "tous les lots"
    // si omis) — filtré ici en mémoire pour exiger une correspondance EXACTE (y compris "aucun
    // lot" des deux côtés), jamais un chiffrage d'un AUTRE lot comparé par erreur.
    const siblingSchedules = (
      await this.scheduleRepository.list({ organizationId: query.organizationId, tenderId: schedule.tenderId, clientAccountId: schedule.clientAccountId })
    ).filter((sibling) => sibling.lotId === schedule.lotId && sibling.financialDocumentType === oppositeType && sibling.currentVersionId);

    const findings: BpuDqeCoherenceFinding[] = [];
    for (const sibling of siblingSchedules) {
      const siblingVersion = await this.versionRepository.findById({ organizationId: query.organizationId, pricingScheduleVersionId: sibling.currentVersionId! });
      if (!siblingVersion) continue;
      const comparedLines = await this.lineRepository.listByVersion({ organizationId: query.organizationId, pricingScheduleVersionId: siblingVersion.id });
      findings.push(...matchBpuDqeCoherence({ primaryLines, comparedScheduleId: sibling.id, comparedLines }));
    }

    return findings;
  }
}
