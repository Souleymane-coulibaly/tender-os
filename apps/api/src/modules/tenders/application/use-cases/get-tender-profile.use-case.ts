import { Inject, Injectable } from "@nestjs/common";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase, type ClientAccountSummary } from "../../../client-portfolio";
import { TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { computeTenderCompleteness, type TenderCompleteness } from "../services/tender-completeness.calculator";
import {
  toAwardCriterionSummary,
  toBuyerSummary,
  toMilestoneSummary,
  toRiskSummary,
  toTenderLotSummary,
  toTenderSummary,
  type AwardCriterionSummary,
  type BuyerSummary,
  type MilestoneSummary,
  type RiskSummary,
  type TenderLotSummary,
  type TenderSummary,
} from "../dtos";
import { AWARD_CRITERION_REPOSITORY, type AwardCriterionRepository } from "../ports/award-criterion.repository";
import { BUYER_REPOSITORY, type BuyerRepository } from "../ports/buyer.repository";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_STATUS_HISTORY_REPOSITORY, type TenderStatusHistoryEntry, type TenderStatusHistoryRepository } from "../ports/tender-status-history.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";

export type GetTenderProfileQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string }>;

export type TenderProfile = Readonly<{
  tender: TenderSummary;
  candidate: ClientAccountSummary;
  buyer: BuyerSummary | null;
  lots: readonly TenderLotSummary[];
  criteria: readonly AwardCriterionSummary[];
  milestones: readonly MilestoneSummary[];
  risks: readonly RiskSummary[];
  statusHistory: readonly TenderStatusHistoryEntry[];
  completeness: TenderCompleteness;
}>;

/**
 * V2 Sprint 3 §14 — profil consolidé du Tender : agrège les données générales, l'entreprise
 * candidate (résolue depuis le profil Client Portfolio existant, jamais dupliquée ici), l'acheteur,
 * les lots, critères, pièces demandées, jalons, risques, le statut/historique et la complétude.
 * Ne retourne jamais les données bancaires/sensibles de l'entreprise candidate (`ClientAccountSummary`
 * ne les porte pas — c'est `company-profile.GetCompanyProfileUseCase`, jamais appelé ici, qui les
 * expose derrière sa propre permission dédiée), jamais un score GO/NO-GO, jamais d'analyse IA
 * (aucune n'existe encore ce sprint). Toutes les listes sont chargées en parallèle (`Promise.all`)
 * pour éviter tout N+1 (mission §14 "prévoir une agrégation performante").
 */
@Injectable()
export class GetTenderProfileUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(BUYER_REPOSITORY) private readonly buyerRepository: BuyerRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(TENDER_STATUS_HISTORY_REPOSITORY) private readonly statusHistoryRepository: TenderStatusHistoryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetTenderProfileQuery): Promise<TenderProfile> {
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const tender = await this.tenderRepository.findById({ organizationId: query.organizationId, tenderId: query.tenderId });
    if (!tender) {
      throw new TenderNotFoundError();
    }

    await this.assertClientAccessUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadTender,
    });

    const candidate = await this.getClientAccountUseCase.execute({
      organizationId: query.organizationId,
      clientAccountId: tender.clientAccountId,
      actorId: query.actorId,
      actorRole: query.actorRole,
    });

    const [buyer, lots, criteria, checklistItems, milestones, risks, statusHistory] = await Promise.all([
      tender.buyerId ? this.buyerRepository.findById({ organizationId: query.organizationId, buyerId: tender.buyerId }) : Promise.resolve(null),
      this.lotRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.criterionRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.checklistItemRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.milestoneRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.riskRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
      this.statusHistoryRepository.listByTender({ organizationId: query.organizationId, tenderId: query.tenderId }),
    ]);

    const now = this.clock.now();

    const completeness = computeTenderCompleteness({
      tender,
      candidateArchived: candidate.status === "ARCHIVED",
      lots,
      criteria,
      checklistItemsCount: checklistItems.length,
      milestones,
      risksCount: risks.length,
      now,
    });

    return {
      tender: toTenderSummary(tender),
      candidate,
      buyer: buyer ? toBuyerSummary(buyer) : null,
      lots: lots.map(toTenderLotSummary),
      criteria: criteria.map(toAwardCriterionSummary),
      milestones: milestones.map((milestone) => toMilestoneSummary(milestone, now)),
      risks: risks.map(toRiskSummary),
      statusHistory: statusHistory.slice(0, 20),
      completeness,
    };
  }
}
