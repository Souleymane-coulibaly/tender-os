import { Inject, Injectable, Logger } from "@nestjs/common";
import { SummarizeCandidateCompanyReadinessUseCase } from "../../../candidate-company";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { HasAnyAdministrativeDocumentUseCase } from "../../../administrative-dossier";
import { ListAccessibleClientsUseCase, ListClientAccountsUseCase } from "../../../client-portfolio";
import { GetCurrentUserUseCase } from "../../../identity";
import { CountActiveMembersUseCase } from "../../../memberships";
import { GetOrganizationUseCase } from "../../../organizations";
import { GetMyTasksUseCase, ListMyApprovalsUseCase, ListRecentActivityForDashboardUseCase, ListTenderParticipantsUseCase } from "../../../workspace";
import { GetResponsePackagePortfolioSummaryForDashboardUseCase, ResponsePackageStatus } from "../../../response-package";
import { GetGoNoGoSummaryForDashboardUseCase, GoNoGoDecisionValue } from "../../../opportunity";
import { ListSavedSearchesUseCase, ListSavedSearchMatchesUseCase, MarketWatchPermissionMissingError, SavedSearchMatchStatus, type SavedSearchMatchWithTender } from "../../../market-watch";
import { GetTenderActivityTrendUseCase, GetTenderListViewUseCase, GetTenderStatisticsUseCase, ReadinessStatus, TenderPermission, TenderStatus, assertHasTenderPermission } from "../../../tenders";
import { DeadlineBucket } from "../../domain/enums";
import { classifyDeadlineBucket } from "../../domain/services/classify-deadline-bucket";
import { deriveAttentionReasons } from "../../domain/services/derive-attention-reasons";
import {
  ActivationChecklistItemId,
  EMPTY_DASHBOARD_OVERVIEW,
  type DashboardActivationChecklistDto,
  type DashboardAnalyticsDto,
  type DashboardAssigneeDto,
  type DashboardAttentionItemDto,
  type DashboardDeadlineBucketCountDto,
  type DashboardDeadlineItemDto,
  type DashboardMarketWatchDto,
  type DashboardOverviewDto,
  type DashboardPipelineStageDto,
  type DashboardRecommendedOpportunityDto,
} from "../dtos";

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
/** V2 Sprint 25 (Dashboard Premium) — mission §25.59 "responsables" : les avatars ne sont affichés
 *  que pour les tout premiers dossiers prioritaires réellement rendus par le widget ("Mes dossiers
 *  prioritaires" n'en montre qu'une poignée) — jamais un N+1 sur les 50 éléments d'`attentionItems`
 *  (mission §25.95 "éviter 15 requêtes indépendantes"). */
const PRIORITY_ASSIGNEES_LIMIT = 6;
const PRIORITY_ASSIGNEES_PER_TENDER_LIMIT = 4;
/** V2 Sprint 25 — mission §25.63 "quelques opportunités pertinentes" : borne le nombre de veilles
 *  interrogées (jamais TOUTES les veilles de l'utilisateur, potentiellement nombreuses) et le
 *  nombre de correspondances affichées, jamais un second moteur de tri/pagination dupliqué. */
const MARKET_WATCH_SEARCHES_SCAN_LIMIT = 3;
const MARKET_WATCH_MATCHES_PER_SEARCH_LIMIT = 10;
const MARKET_WATCH_RECOMMENDED_DISPLAY_LIMIT = 4;

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
  private readonly logger = new Logger(GetDashboardOverviewUseCase.name);

  constructor(
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
    private readonly getTenderStatisticsUseCase: GetTenderStatisticsUseCase,
    private readonly getTenderListViewUseCase: GetTenderListViewUseCase,
    private readonly getMyTasksUseCase: GetMyTasksUseCase,
    private readonly listMyApprovalsUseCase: ListMyApprovalsUseCase,
    private readonly listRecentActivityForDashboardUseCase: ListRecentActivityForDashboardUseCase,
    private readonly getResponsePackagePortfolioSummaryForDashboardUseCase: GetResponsePackagePortfolioSummaryForDashboardUseCase,
    private readonly getGoNoGoSummaryForDashboardUseCase: GetGoNoGoSummaryForDashboardUseCase,
    private readonly listTenderParticipantsUseCase: ListTenderParticipantsUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly listSavedSearchesUseCase: ListSavedSearchesUseCase,
    private readonly listSavedSearchMatchesUseCase: ListSavedSearchMatchesUseCase,
    private readonly countActiveMembersUseCase: CountActiveMembersUseCase,
    private readonly listClientAccountsUseCase: ListClientAccountsUseCase,
    private readonly summarizeCandidateCompanyReadinessUseCase: SummarizeCandidateCompanyReadinessUseCase,
    private readonly hasAnyAdministrativeDocumentUseCase: HasAnyAdministrativeDocumentUseCase,
    // Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 Premium Analytics) — même discipline que le
    // reste du constructeur : use cases publics déjà RBAC/ClientAccess-gated d'autres modules,
    // jamais un second calcul métier local.
    private readonly getTenderActivityTrendUseCase: GetTenderActivityTrendUseCase,
    private readonly getOrganizationUseCase: GetOrganizationUseCase,
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

    const [tenderStats, activeTendersPage, myTasksOverdue, pendingApprovalsCount, organization] = await Promise.all([
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
      // V2 Sprint 18 (mission §66-68) — "Validations en attente : N", même discipline ClientAccess
      // que myTasksOverdue ci-dessus.
      // Checkpoint TENDEROS-2.1-P2.3-E12.1 — `count` (COUNT(*) SQL) et non `execute` : le Dashboard
      // n'a jamais eu besoin que du NOMBRE ici. Sémantique du KPI strictement inchangée (mêmes
      // prédicats, même périmètre ClientAccess), seules les lignes cessent d'être matérialisées.
      this.listMyApprovalsUseCase.count({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, clientAccountId: scopedClientAccountId, status: "PENDING" }),
      // Checkpoint E5 (Premium Analytics addendum §32) — fuseau horaire réel de l'organisation pour
      // le bucketing par jour du graphique d'activité, jamais une hypothèse Europe/Paris/UTC.
      this.getOrganizationUseCase.execute({ id: query.organizationId }),
    ]);

    const tenderIds = activeTendersPage.items.map((tender) => tender.id);
    const [goNoGo, myTasksItems, activity, activityTrend, packages] = await Promise.all([
      this.getGoNoGoSummaryForDashboardUseCase.execute({ organizationId: query.organizationId, tenderIds, since }),
      this.getMyTasksUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole, clientAccountId: scopedClientAccountId }),
      this.listRecentActivityForDashboardUseCase.execute({ organizationId: query.organizationId, tenderIds, limit: ACTIVITY_LIMIT }),
      this.getTenderActivityTrendUseCase.execute({
        organizationId: query.organizationId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        clientAccountId: scopedClientAccountId,
        periodDays,
        timezone: organization.defaultTimezone,
        now,
      }),
      // Checkpoint TENDEROS-2.1-P2.3-E12 (Dashboard unbounded query) — déplacé dans cette seconde
      // vague parce qu'il a désormais besoin de `tenderIds` : les lignes détaillées ne sont
      // matérialisées que pour les Tenders réellement rendus, tandis que les compteurs de
      // portefeuille (CURRENT_STATE) sont agrégés par PostgreSQL. Le filtre client est poussé dans
      // le SQL au lieu d'être appliqué en mémoire ici après avoir tout chargé. Aucune vague
      // supplémentaire : cette vague existait déjà.
      this.getResponsePackagePortfolioSummaryForDashboardUseCase.execute({
        organizationId: query.organizationId,
        actorId: query.actorId,
        actorRole: query.actorRole,
        clientAccountId: scopedClientAccountId,
        tenderIds,
      }),
    ]);

    const packagesByTender = new Map<string, { lotId: string | null; status: ResponsePackageStatus }[]>();
    for (const row of packages.rowsForTenders) {
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
        buyerName: tender.buyerName,
        lotCount: lotPackages.length,
        assignees: [],
      });
    }
    attentionItems.sort((a, b) => attentionRank(a.bucket) - attentionRank(b.bucket) || a.readinessScore - b.readinessScore);

    // `buildActivationChecklist` a besoin de `marketWatch.hasSavedSearches` (mission §25.69
    // "Configurer la veille") — résolu avant plutôt que de dupliquer l'appel
    // `listSavedSearchesUseCase` déjà fait à l'intérieur de `buildMarketWatchSummary`.
    const marketWatch = await this.buildMarketWatchSummary(query);
    const [attentionItemsWithAssignees, activationChecklist] = await Promise.all([
      this.resolveAssignees(attentionItems, query),
      this.buildActivationChecklist(query, activeTendersPage.items.length > 0, marketWatch.hasSavedSearches),
    ]);

    const pipeline: DashboardPipelineStageDto[] = Object.entries(tenderStats.byStatus).map(([status, count]) => ({ status: status as TenderStatus, count }));

    // Checkpoint E5 (Premium Analytics addendum §8) — tally de `readinessStatus` déjà résolu sur
    // `nonTerminalTenders` (même périmètre que `attentionItems`/`deadlines`), ZÉRO requête
    // supplémentaire, jamais un second calcul de readiness.
    const readinessCountByStatus = {} as Record<ReadinessStatus, number>;
    for (const tender of nonTerminalTenders) {
      readinessCountByStatus[tender.readinessStatus] = (readinessCountByStatus[tender.readinessStatus] ?? 0) + 1;
    }

    // Checkpoint E5 (addendum §9) — tally de `deadlineItems[].bucket`, déjà classifié plus haut.
    const deadlineBucketCounts = new Map<DeadlineBucket, number>();
    for (const item of deadlineItems) {
      deadlineBucketCounts.set(item.bucket, (deadlineBucketCounts.get(item.bucket) ?? 0) + 1);
    }
    const deadlineBuckets: DashboardDeadlineBucketCountDto[] = Object.values(DeadlineBucket).map((bucket) => ({ bucket, count: deadlineBucketCounts.get(bucket) ?? 0 }));

    // Checkpoint E5 (addendum §7) — formule EXACTE et documentée : (GO + GO_CONDITIONAL) /
    // décisions enregistrées sur la période, JAMAIS / tous les Tenders (dénominateur = goNoGo.total,
    // lui-même déjà le compte réel des décisions period-scoped — voir GetGoNoGoSummaryForDashboardUseCase).
    const goCount = (goNoGo.countByDecision[GoNoGoDecisionValue.Go] ?? 0) + (goNoGo.countByDecision[GoNoGoDecisionValue.GoConditional] ?? 0);
    const goRate = goNoGo.total > 0 ? Math.round((goCount / goNoGo.total) * 100) : null;

    const analytics: DashboardAnalyticsDto = {
      periodDays,
      activityTrend,
      readinessDistribution: { countByStatus: readinessCountByStatus, total: nonTerminalTenders.length },
      deadlineBuckets,
      goRate,
    };

    return {
      generatedAt: now.toISOString(),
      scope,
      kpis: {
        activeTenders: tenderStats.totalActive,
        deadlinesNext7Days: tenderStats.deadlinesNext7Days,
        overdueTenders: tenderStats.overdueCount,
        readyToSubmit: tenderStats.readyToSubmitCount,
        // Checkpoint TENDEROS-2.1-P2.3-E12 — sémantique métier INCHANGÉE (dossiers du portefeuille
        // accessible dont le statut dénormalisé est prêt/validé/exporté, état courant GLOBAL sans
        // aucun cutoff temporel) ; seul le mode de calcul change : somme d'un agrégat PostgreSQL
        // plutôt que filtrage en mémoire de toutes les lignes du portefeuille.
        packagesReady: READY_PACKAGE_STATUSES.reduce((sum, status) => sum + (packages.countByStatus[status] ?? 0), 0),
        // Mission §60 "KPI et listes doivent utiliser les mêmes règles de filtrage" — TOUJOURS la
        // longueur COMPLÈTE (avant troncature d'affichage ci-dessous), jamais la longueur de la
        // page affichée.
        needingAttention: attentionItems.length,
        overdueTasks: myTasksOverdue.length,
        pendingApprovals: pendingApprovalsCount,
      },
      pipeline,
      deadlines: deadlineItems.slice(0, DEADLINES_DISPLAY_LIMIT),
      attentionItems: attentionItemsWithAssignees.slice(0, ATTENTION_DISPLAY_LIMIT),
      packages: { countByStatus: packages.countByStatus as Record<ResponsePackageStatus, number>, total: packages.total },
      goNoGo: { countByDecision: goNoGo.countByDecision, total: goNoGo.total, periodDays },
      myTasks: { overdueCount: myTasksOverdue.length, items: myTasksItems.slice(0, MY_TASKS_DISPLAY_LIMIT) },
      activity: activity.map((entry) => ({ id: entry.id, tenderId: entry.tenderId, type: entry.type, summary: entry.summary, createdAt: entry.createdAt.toISOString() })),
      marketWatch,
      activationChecklist,
      averageReadinessScore: tenderStats.averageReadinessScore,
      analytics,
    };
  }

  /** V2 Sprint 25 (Dashboard Premium) — mission §25.59 "responsables", enrichit UNIQUEMENT les tout
   *  premiers éléments réellement affichés par le widget (voir `PRIORITY_ASSIGNEES_LIMIT`), jamais
   *  les 50 éléments d'`attentionItems`. Une erreur de résolution isolée (utilisateur supprimé
   *  entre-temps) ne doit jamais faire échouer tout le Dashboard — même discipline "jamais
   *  bloquant" que `fetchBillingSummary` côté frontend. */
  private async resolveAssignees(items: readonly DashboardAttentionItemDto[], query: GetDashboardOverviewQuery): Promise<DashboardAttentionItemDto[]> {
    const toEnrich = items.slice(0, PRIORITY_ASSIGNEES_LIMIT);
    const participantsByTender = await Promise.all(
      toEnrich.map((item) =>
        this.listTenderParticipantsUseCase
          .execute({ organizationId: query.organizationId, tenderId: item.tenderId, actorId: query.actorId, actorRole: query.actorRole })
          .catch(() => []),
      ),
    );

    const uniqueUserIds = Array.from(new Set(participantsByTender.flat().map((p) => p.userId)));
    const displayNameByUserId = new Map<string, string>();
    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        try {
          const user = await this.getCurrentUserUseCase.execute({ userId });
          displayNameByUserId.set(userId, user.displayName);
        } catch {
          // Utilisateur introuvable (supprimé/anonymisé depuis) — jamais bloquant, simplement omis.
        }
      }),
    );

    return items.map((item, index) => {
      if (index >= toEnrich.length) return item;
      const assignees: DashboardAssigneeDto[] = participantsByTender[index]!
        .slice(0, PRIORITY_ASSIGNEES_PER_TENDER_LIMIT)
        .map((p) => ({ userId: p.userId, displayName: displayNameByUserId.get(p.userId) }))
        .filter((a): a is DashboardAssigneeDto => a.displayName !== undefined);
      return { ...item, assignees };
    });
  }

  /** V2 Sprint 25 (Dashboard Premium) — mission §25.63/§25.64. Scopé aux veilles de l'ACTEUR
   *  COURANT (même périmètre que `ListSavedSearchesUseCase`, jamais celles d'un autre membre de
   *  l'organisation), et jamais les correspondances déjà `IGNORED` par l'utilisateur (mission "des
   *  opportunités RECOMMANDÉES", pas déjà écartées).
   *
   *  Correctif audit Checkpoint E5 (RBAC) — `EXTERNAL_CONSULTANT`/`READ_ONLY` n'ont AUCUNE
   *  `MarketWatchPermission` (`ROLE_MARKET_WATCH_PERMISSIONS`, module Market Watch), alors que
   *  `TenderPermission.Read` — la SEULE garde de `execute()` ci-dessus — leur est accordée : sans
   *  ce `try/catch`, `ListSavedSearchesUseCase` lève `MarketWatchPermissionMissingError` et fait
   *  échouer la totalité du Dashboard pour ces deux rôles, pas seulement ce widget (jamais
   *  l'intention — mission §5 "distinguer ce que l'organisation possède de ce que l'utilisateur
   *  courant peut voir" ne doit jamais dégénérer en page cassée). Même discipline "jamais
   *  bloquant" que `fetchBillingSummary` côté frontend et `resolveAssignees` ci-dessus : un acteur
   *  sans droit Market Watch voit simplement `hasSavedSearches: false`, jamais une erreur. */
  private async buildMarketWatchSummary(query: GetDashboardOverviewQuery): Promise<DashboardMarketWatchDto> {
    let savedSearches: Awaited<ReturnType<ListSavedSearchesUseCase["execute"]>>;
    try {
      savedSearches = await this.listSavedSearchesUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole });
    } catch (error) {
      // Checkpoint TENDEROS-2.1-P2.3-E12 (P1, mission §4 "erreurs actuellement avalées") — ce
      // `catch` était NON TYPÉ et SANS LOG : il n'absorbait pas seulement le cas RBAC documenté
      // ci-dessus, il absorbait AUSSI une panne réelle (base indisponible, repository en erreur) en
      // renvoyant des données métier FABRIQUÉES ("aucune veille configurée"). Un incident de
      // disponibilité devenait alors indistinguable d'un widget légitimement vide, côté utilisateur
      // comme côté exploitant, sans la moindre trace. Seule l'absence de droit Market Watch reste
      // silencieuse (comportement voulu, voir ci-dessus) ; toute autre cause est désormais
      // journalisée en ERROR — le Dashboard reste non bloquant (jamais une page cassée pour un seul
      // widget), mais l'incident cesse d'être invisible.
      if (!(error instanceof MarketWatchPermissionMissingError)) {
        this.logger.error(
          `Market Watch dashboard widget failed for organization ${query.organizationId}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
      return { hasSavedSearches: false, relevantOpportunitiesCount: 0, recommended: [] };
    }
    if (savedSearches.length === 0) {
      return { hasSavedSearches: false, relevantOpportunitiesCount: 0, recommended: [] };
    }

    const scannedSearches = savedSearches.slice(0, MARKET_WATCH_SEARCHES_SCAN_LIMIT);
    const matchPages = await Promise.all(
      scannedSearches.map((search) =>
        this.listSavedSearchMatchesUseCase.execute({
          organizationId: query.organizationId,
          actorId: query.actorId,
          actorRole: query.actorRole,
          savedSearchId: search.id,
          limit: MARKET_WATCH_MATCHES_PER_SEARCH_LIMIT,
        }),
      ),
    );

    const relevantByTenderId = new Map<string, SavedSearchMatchWithTender>();
    for (const page of matchPages) {
      for (const entry of page.items) {
        if (entry.match.status === SavedSearchMatchStatus.Ignored) continue;
        const existing = relevantByTenderId.get(entry.match.externalTenderId);
        if (!existing || entry.match.score > existing.match.score) {
          relevantByTenderId.set(entry.match.externalTenderId, entry);
        }
      }
    }

    const relevant = Array.from(relevantByTenderId.values()).sort((a, b) => b.match.score - a.match.score);
    const recommended: DashboardRecommendedOpportunityDto[] = relevant.slice(0, MARKET_WATCH_RECOMMENDED_DISPLAY_LIMIT).map((entry) => ({
      externalTenderId: entry.tender.id,
      savedSearchId: entry.match.savedSearchId,
      title: entry.tender.title,
      buyerName: entry.tender.buyerName,
      score: entry.match.score,
      matchedLabels: entry.match.matchReasons.filter((reason) => reason.matched).map((reason) => reason.label).slice(0, 3),
    }));

    return { hasSavedSearches: true, relevantOpportunitiesCount: relevant.length, recommended };
  }

  /** V2 Sprint 25 (Dashboard Premium) — mission §25.69/§25.70 "Checklist dynamique... dérivée de
   *  l'état réel". Chaque item interroge une source réelle déjà existante ailleurs dans le produit,
   *  jamais un second état manuel persisté. `hasAnyTender`/`hasSavedSearches` sont réutilisés depuis
   *  le calcul déjà fait plus haut dans `execute()`, jamais un second appel. */
  private async buildActivationChecklist(query: GetDashboardOverviewQuery, hasAnyTender: boolean, hasSavedSearches: boolean): Promise<DashboardActivationChecklistDto> {
    const [memberCount, hasAdministrativeDocuments, hasCompleteCandidateCompany] = await Promise.all([
      this.countActiveMembersUseCase.execute({ organizationId: query.organizationId }),
      this.hasAnyAdministrativeDocumentUseCase.execute({ organizationId: query.organizationId }),
      this.hasCompleteCandidateCompany(query),
    ]);

    const items = [
      { id: ActivationChecklistItemId.AccountCreated, label: "Compte créé", completed: true },
      { id: ActivationChecklistItemId.OrganizationConfigured, label: "Organisation configurée", completed: true },
      { id: ActivationChecklistItemId.CandidateCompanyComplete, label: "Compléter l'entreprise candidate", completed: hasCompleteCandidateCompany },
      { id: ActivationChecklistItemId.AdministrativeDocumentsAdded, label: "Ajouter les documents administratifs", completed: hasAdministrativeDocuments },
      { id: ActivationChecklistItemId.MarketWatchConfigured, label: "Configurer la veille", completed: hasSavedSearches },
      { id: ActivationChecklistItemId.FirstDceImported, label: "Importer le premier DCE", completed: hasAnyTender },
      // Mission §25.69 : coché dès que l'organisation compte plus d'un membre actif (soi-même +
      // au moins un collaborateur), jamais un compteur d'invitations envoyées (aucune surface
      // d'invitation n'existe encore dans le produit, voir Checkpoint 25D).
      { id: ActivationChecklistItemId.CollaboratorInvited, label: "Inviter un collaborateur", completed: memberCount > 1 },
    ];

    return { items, completedCount: items.filter((item) => item.completed).length, totalCount: items.length };
  }

  /** "Complète" = au moins une entreprise candidate accessible avec la catégorie `identity`
   *  (raison sociale/SIRET/représentants) au statut COMPLETE — mission §8 du module company-profile
   *  interdit explicitement un score global unique ; `identity` est retenu comme signal le plus
   *  proche de l'intention "Compléter l'entreprise candidate" (les autres catégories — assurances,
   *  certifications... — restent des enrichissements ultérieurs, pas un prérequis d'activation).
   *  Bornée à quelques comptes accessibles (jamais tous), une erreur de résolution isolée n'empêche
   *  jamais le reste de la checklist de s'afficher. */
  /**
   * Checkpoint TENDEROS-2.1-CCV2-I.1 — ferme `P2-DASHBOARD-SEMANTIC-SOT`.
   *
   * Cette coche s'appelle « Compléter l'entreprise candidate » : elle interrogeait pourtant la
   * complétude du profil des `ClientAccount`. Un client commercial n'est pas l'entité qui
   * candidate — la coche pouvait donc être verte sans qu'aucune entreprise candidate n'existe.
   * Elle lit désormais la SOT candidate.
   *
   * Sémantique MULTI-CANDIDAT explicite (mission §15) : « au moins une entreprise candidate a une
   * identité complète ». Aucune candidate n'est désignée — ni la première, ni la plus récente — ce
   * qui rend le résultat indépendant de l'ordre de lecture et impossible à confondre entre deux
   * candidates d'une même organisation.
   */
  private async hasCompleteCandidateCompany(query: GetDashboardOverviewQuery): Promise<boolean> {
    const readiness = await this.summarizeCandidateCompanyReadinessUseCase.execute({ organizationId: query.organizationId });
    return readiness.hasAtLeastOneComplete;
  }
}
