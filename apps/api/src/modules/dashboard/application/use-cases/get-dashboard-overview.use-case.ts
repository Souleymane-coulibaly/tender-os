import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { GetMyTasksUseCase, ListRecentActivityForDashboardUseCase } from "../../../workspace";
import { GetResponsePackagePortfolioSummaryForDashboardUseCase, ResponsePackageStatus } from "../../../response-package";
import { GetGoNoGoSummaryForDashboardUseCase } from "../../../opportunity";
import { GetTenderListViewUseCase, GetTenderStatisticsUseCase, TenderPermission, TenderStatus, assertHasTenderPermission } from "../../../tenders";
import { DeadlineBucket } from "../../domain/enums";
import { classifyDeadlineBucket } from "../../domain/services/classify-deadline-bucket";
import { deriveAttentionReasons } from "../../domain/services/derive-attention-reasons";
import { EMPTY_DASHBOARD_OVERVIEW, type DashboardAttentionItemDto, type DashboardDeadlineItemDto, type DashboardOverviewDto, type DashboardPipelineStageDto } from "../dtos";

export type GetDashboardOverviewQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId?: string | undefined;
  periodDays?: number | undefined;
}>;

const TERMINAL_STATUSES: readonly TenderStatus[] = [TenderStatus.Won, TenderStatus.Lost, TenderStatus.Archived];
const READY_PACKAGE_STATUSES: readonly ResponsePackageStatus[] = [ResponsePackageStatus.Ready, ResponsePackageStatus.Validated, ResponsePackageStatus.Exported];

/** Mission §55/§56 — fenêtre de travail bornée pour les widgets "liste" (échéances, à traiter,
 *  activité, GO/NO-GO période) : triée par `updatedAt DESC` (jamais `submissionDeadline ASC` brut,
 *  qui ferait remonter en tête des Tenders WON/LOST archivés il y a des années avec une deadline
 *  passée ancienne, avant les Tenders réellement actifs — voir rapport Sprint 15 §"risques
 *  résiduels"). Les KPI/pipeline restent, eux, calculés par agrégation DB exacte
 *  (`GetTenderStatisticsUseCase`), jamais dérivés de cette fenêtre bornée. */
const ACTIVE_TENDERS_SCAN_LIMIT = 300;
const DEADLINES_DISPLAY_LIMIT = 50;
const ATTENTION_DISPLAY_LIMIT = 50;
const ACTIVITY_LIMIT = 20;
const MY_TASKS_DISPLAY_LIMIT = 10;
const DEFAULT_PERIOD_DAYS = 30;

function attentionRank(bucket: DeadlineBucket | undefined): number {
  switch (bucket) {
    case DeadlineBucket.Overdue:
      return 0;
    case DeadlineBucket.Today:
      return 1;
    case DeadlineBucket.Tomorrow:
      return 2;
    case DeadlineBucket.ThisWeek:
      return 3;
    default:
      return 4;
  }
}

/**
 * Mission Sprint 15 — read model du cockpit portfolio (KPI/pipeline/échéances/à traiter/
 * progression/tâches/activité/GO-NO-GO/analytics), jamais une réimplémentation de la logique
 * métier d'écriture (mission §53). Compose UNIQUEMENT des use-cases publics déjà RBAC/ClientAccess-
 * gated des autres modules (`GetTenderStatisticsUseCase`, `GetTenderListViewUseCase`,
 * `GetMyTasksUseCase`, `GetResponsePackagePortfolioSummaryForDashboardUseCase`,
 * `GetGoNoGoSummaryForDashboardUseCase`, `ListRecentActivityForDashboardUseCase`) — zéro accès
 * Prisma direct, zéro second calcul de readiness/pipeline/complétude (mission §115).
 */
@Injectable()
export class GetDashboardOverviewUseCase {
  constructor(
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
    private readonly getTenderStatisticsUseCase: GetTenderStatisticsUseCase,
    private readonly getTenderListViewUseCase: GetTenderListViewUseCase,
    private readonly getMyTasksUseCase: GetMyTasksUseCase,
    private readonly listRecentActivityForDashboardUseCase: ListRecentActivityForDashboardUseCase,
    private readonly getResponsePackagePortfolioSummaryForDashboardUseCase: GetResponsePackagePortfolioSummaryForDashboardUseCase,
    private readonly getGoNoGoSummaryForDashboardUseCase: GetGoNoGoSummaryForDashboardUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: GetDashboardOverviewQuery): Promise<DashboardOverviewDto> {
    // Mission §14 "Dashboard visibility ≠ bypass sécurité" — même garde org-tier que toute vue
    // Tenders (mission §18 "VIEWER -> lecture des informations autorisées", TenderPermission.Read
    // est accordée à tous les rôles organisation, y compris READ_ONLY/REVIEWER/EXECUTIVE/
    // EXTERNAL_CONSULTANT).
    assertHasTenderPermission(query.actorRole, TenderPermission.Read);

    const now = this.clock.now();
    const periodDays = query.periodDays && query.periodDays > 0 ? query.periodDays : DEFAULT_PERIOD_DAYS;
    const since = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    // Mission §14/§66 — TOUJOURS Current User -> Organization -> ClientAccess -> agrégation, jamais
    // l'inverse. Un `clientId` non accessible (mission §72 "SECURITY — QUERY PARAM CLIENT") ne peut
    // JAMAIS élargir le périmètre : narrows to "aucun résultat", jamais un contournement.
    const accessible = await this.listAccessibleClientsUseCase.execute(query);

    let scopedClientAccountId: string | undefined;
    let deniedFilter = false;
    if (query.clientAccountId) {
      const authorized = accessible.allClients || accessible.clientAccountIds.includes(query.clientAccountId);
      if (authorized) {
        scopedClientAccountId = query.clientAccountId;
      } else {
        deniedFilter = true;
      }
    }

    const scope = { allClients: accessible.allClients && scopedClientAccountId === undefined, clientAccountId: scopedClientAccountId };

    if (deniedFilter || (!accessible.allClients && accessible.clientAccountIds.length === 0)) {
      return EMPTY_DASHBOARD_OVERVIEW(now.toISOString(), scope, periodDays);
    }

    const [tenderStats, activeTendersPage, myTasksOverdue, packageRowsAll] = await Promise.all([
      this.getTenderStatisticsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, clientAccountId: scopedClientAccountId }),
      this.getTenderListViewUseCase.execute({
        organizationId: query.organizationId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        limit: ACTIVE_TENDERS_SCAN_LIMIT,
        clientAccountId: scopedClientAccountId,
        sort: "updatedAt",
        sortDirection: "desc",
      }),
      this.getMyTasksUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, clientAccountId: scopedClientAccountId, overdueOnly: true }),
      this.getResponsePackagePortfolioSummaryForDashboardUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole }),
    ]);

    const packageRows = scopedClientAccountId ? packageRowsAll.filter((row) => row.clientAccountId === scopedClientAccountId) : packageRowsAll;

    const tenderIds = activeTendersPage.items.map((tender) => tender.id);
    const [goNoGo, myTasksItems, activity] = await Promise.all([
      this.getGoNoGoSummaryForDashboardUseCase.execute({ organizationId: query.organizationId, tenderIds, since }),
      this.getMyTasksUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, clientAccountId: scopedClientAccountId }),
      this.listRecentActivityForDashboardUseCase.execute({ organizationId: query.organizationId, tenderIds, limit: ACTIVITY_LIMIT }),
    ]);

    const packagesByTender = new Map<string, { lotId: string | null; status: ResponsePackageStatus }[]>();
    for (const row of packageRows) {
      const list = packagesByTender.get(row.tenderId) ?? [];
      list.push({ lotId: row.lotId, status: row.status });
      packagesByTender.set(row.tenderId, list);
    }

    const nonTerminalTenders = activeTendersPage.items.filter((tender) => !TERMINAL_STATUSES.includes(tender.status));

    const deadlineItems: DashboardDeadlineItemDto[] = nonTerminalTenders
      .filter((tender): tender is typeof tender & { submissionDeadline: string } => tender.submissionDeadline !== undefined)
      .map((tender) => ({
        tenderId: tender.id,
        title: tender.title,
        clientAccountId: tender.clientAccountId,
        submissionDeadline: tender.submissionDeadline,
        bucket: classifyDeadlineBucket(new Date(tender.submissionDeadline), now),
      }))
      .sort((a, b) => new Date(a.submissionDeadline).getTime() - new Date(b.submissionDeadline).getTime());

    const attentionItems: DashboardAttentionItemDto[] = [];
    for (const tender of nonTerminalTenders) {
      const bucket = tender.submissionDeadline ? classifyDeadlineBucket(new Date(tender.submissionDeadline), now) : undefined;
      const lotPackages = packagesByTender.get(tender.id) ?? [];
      const reasons = deriveAttentionReasons({
        deadlineBucket: bucket,
        incompleteChecklistCount: tender.incompleteChecklistCount,
        readinessStatus: tender.readinessStatus,
        packageStatuses: lotPackages.map((p) => p.status),
      });
      if (reasons.length === 0) continue;
      attentionItems.push({
        tenderId: tender.id,
        title: tender.title,
        clientAccountId: tender.clientAccountId,
        status: tender.status,
        submissionDeadline: tender.submissionDeadline,
        bucket,
        reasons,
        readinessScore: tender.readinessScore,
        incompleteChecklistCount: tender.incompleteChecklistCount,
        lotPackages,
      });
    }
    attentionItems.sort((a, b) => attentionRank(a.bucket) - attentionRank(b.bucket) || a.readinessScore - b.readinessScore);

    const packageCountByStatus = {} as Record<ResponsePackageStatus, number>;
    for (const row of packageRows) {
      packageCountByStatus[row.status] = (packageCountByStatus[row.status] ?? 0) + 1;
    }

    const pipeline: DashboardPipelineStageDto[] = Object.entries(tenderStats.byStatus).map(([status, count]) => ({ status: status as TenderStatus, count }));

    return {
      generatedAt: now.toISOString(),
      scope,
      kpis: {
        activeTenders: tenderStats.totalActive,
        deadlinesNext7Days: tenderStats.deadlinesNext7Days,
        overdueTenders: tenderStats.overdueCount,
        readyToSubmit: tenderStats.readyToSubmitCount,
        packagesReady: packageRows.filter((row) => READY_PACKAGE_STATUSES.includes(row.status)).length,
        // Mission §60 "KPI et listes doivent utiliser les mêmes règles de filtrage" — TOUJOURS la
        // longueur COMPLÈTE (avant troncature d'affichage ci-dessous), jamais la longueur de la
        // page affichée.
        needingAttention: attentionItems.length,
        overdueTasks: myTasksOverdue.length,
      },
      pipeline,
      deadlines: deadlineItems.slice(0, DEADLINES_DISPLAY_LIMIT),
      attentionItems: attentionItems.slice(0, ATTENTION_DISPLAY_LIMIT),
      packages: { countByStatus: packageCountByStatus, total: packageRows.length },
      goNoGo: { countByDecision: goNoGo.countByDecision, total: goNoGo.total, periodDays },
      myTasks: { overdueCount: myTasksOverdue.length, items: myTasksItems.slice(0, MY_TASKS_DISPLAY_LIMIT) },
      activity: activity.map((entry) => ({ id: entry.id, tenderId: entry.tenderId, type: entry.type, summary: entry.summary, createdAt: entry.createdAt.toISOString() })),
      averageReadinessScore: tenderStats.averageReadinessScore,
    };
  }
}
