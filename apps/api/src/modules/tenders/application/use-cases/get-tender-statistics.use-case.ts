import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { TenderPermission } from "../../domain/tender-permission";
import { TenderStatus } from "../../domain/tender-status";
import type { TenderStatisticsDto } from "../board-dtos";
import { ALERT_REPOSITORY, type AlertRepository } from "../ports/alert.repository";
import { AWARD_CRITERION_REPOSITORY, type AwardCriterionRepository } from "../ports/award-criterion.repository";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../ports/checklist-item.repository";
import { MILESTONE_REPOSITORY, type MilestoneRepository } from "../ports/milestone.repository";
import {
  REQUESTED_DOCUMENT_REPOSITORY,
  type RequestedDocumentRepository,
} from "../ports/requested-document.repository";
import { RISK_REPOSITORY, type RiskRepository } from "../ports/risk.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { enrichTenders } from "../tender-enrichment";

export type GetTenderStatisticsQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string }>;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Borne le calcul de "dossiers à risque" et "préparation moyenne" — ces deux statistiques
 *  nécessitent de charger les Tenders actifs (hors ARCHIVED) pour réutiliser le même moteur
 *  de score que le reste du module (pas de duplication de règle). Au-delà de cette limite
 *  par organisation, la moyenne devient une approximation sur l'échantillon chargé — à
 *  revisiter (agrégation SQL dédiée) si un tenant dépasse ce volume de Tenders actifs. */
const MAX_TENDERS_FOR_RISK_AND_AVERAGE = 1000;

@Injectable()
export class GetTenderStatisticsUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistRepository: ChecklistItemRepository,
    @Inject(REQUESTED_DOCUMENT_REPOSITORY) private readonly documentRepository: RequestedDocumentRepository,
    @Inject(AWARD_CRITERION_REPOSITORY) private readonly criterionRepository: AwardCriterionRepository,
    @Inject(MILESTONE_REPOSITORY) private readonly milestoneRepository: MilestoneRepository,
    @Inject(RISK_REPOSITORY) private readonly riskRepository: RiskRepository,
    @Inject(ALERT_REPOSITORY) private readonly alertRepository: AlertRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: GetTenderStatisticsQuery): Promise<TenderStatisticsDto> {
    assertHasTenderPermission(query.actorRole, TenderPermission.List);

    const now = this.clock.now();
    const organizationId = query.organizationId;

    // Mission Sprint 5.1 §"aucune fuite de données dans les compteurs" — les statistiques ne
    // doivent jamais agréger les tenders d'un client auquel l'acteur n'est pas affecté.
    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return { totalActive: 0, byStatus: {}, deadlinesNext7Days: 0, overdueCount: 0, readyToSubmitCount: 0, atRiskCount: 0, averageReadinessScore: 0 };
    }
    const restrictToClientAccountIds = accessible.allClients ? undefined : accessible.clientAccountIds;

    const [byStatus, deadlinesNext7Days, overdueCount, activePage] = await Promise.all([
      this.tenderRepository.countByStatus({ organizationId, restrictToClientAccountIds }),
      this.tenderRepository.count({
        organizationId,
        restrictToClientAccountIds,
        deadlineAfter: now,
        deadlineBefore: new Date(now.getTime() + SEVEN_DAYS_MS),
      }),
      this.tenderRepository.count({ organizationId, restrictToClientAccountIds, overdue: true }),
      this.tenderRepository.list({ organizationId, restrictToClientAccountIds, limit: MAX_TENDERS_FOR_RISK_AND_AVERAGE, sort: "createdAt" }),
    ]);

    const totalActive = Object.entries(byStatus)
      .filter(([status]) => status !== TenderStatus.Archived)
      .reduce((sum, [, count]) => sum + count, 0);
    const readyToSubmitCount = byStatus[TenderStatus.ReadyToSubmit] ?? 0;

    const activeTenders = activePage.items.filter((tender) => tender.status !== TenderStatus.Archived);
    const tenderIds = activeTenders.map((tender) => tender.id.value);

    const [checklistItems, requestedDocuments, criteria, milestones, risks, alerts] = await Promise.all([
      this.checklistRepository.listByTenderIds({ organizationId, tenderIds }),
      this.documentRepository.listByTenderIds({ organizationId, tenderIds }),
      this.criterionRepository.listByTenderIds({ organizationId, tenderIds }),
      this.milestoneRepository.listByTenderIds({ organizationId, tenderIds }),
      this.riskRepository.listByTenderIds({ organizationId, tenderIds }),
      this.alertRepository.listByTenderIds({ organizationId, tenderIds }),
    ]);

    const enrichment = enrichTenders({
      tenders: activeTenders,
      checklistItems,
      requestedDocuments,
      criteria,
      milestones,
      risks,
      alerts,
      now,
    });

    const readinessResults = [...enrichment.values()].map((entry) => entry.readiness);
    const atRiskCount = readinessResults.filter((readiness) => readiness.hasBlockingIssue).length;
    const averageReadinessScore =
      readinessResults.length === 0
        ? 0
        : Math.round(readinessResults.reduce((sum, readiness) => sum + readiness.score, 0) / readinessResults.length);

    return {
      totalActive,
      byStatus,
      deadlinesNext7Days,
      overdueCount,
      readyToSubmitCount,
      atRiskCount,
      averageReadinessScore,
    };
  }
}
