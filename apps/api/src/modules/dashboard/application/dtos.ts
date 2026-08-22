import type { TaskSummary } from "../../workspace";
import type { TenderActivityType } from "../../workspace";
import type { TenderStatus, TenderListItemDto, ReadinessStatus, TenderActivityTrendPointDto } from "../../tenders";
import type { ResponsePackageStatus } from "../../response-package";
import type { GoNoGoDecisionValue } from "../../opportunity";
import type { AttentionReason, DeadlineBucket } from "../domain/enums";

export type DashboardKpisDto = Readonly<{
  activeTenders: number;
  deadlinesNext7Days: number;
  overdueTenders: number;
  readyToSubmit: number;
  packagesReady: number;
  needingAttention: number;
  overdueTasks: number;
  /** V2 Sprint 18 (mission §66-68) — demandes de validation où l'utilisateur courant est
   *  l'approbateur désigné (`ListMyApprovalsUseCase`, `status: PENDING`), tous Tenders confondus. */
  pendingApprovals: number;
}>;

export type DashboardPipelineStageDto = Readonly<{ status: TenderStatus; count: number }>;

export type DashboardDeadlineItemDto = Readonly<{
  tenderId: string;
  title: string;
  clientAccountId: string;
  submissionDeadline: string;
  bucket: DeadlineBucket;
}>;

/** V2 Sprint 25 (Dashboard Premium) — mission §25.59 "responsables" : résolu depuis
 *  `ListTenderParticipantsUseCase` + `GetCurrentUserUseCase` (même discipline N-appels bornée que
 *  `ListWorkspaceMembersUseCase`/`ListOrganizationMembersUseCase`, aucune méthode batch n'existe
 *  côté Identity), jamais un second modèle d'affectation dupliqué. */
export type DashboardAssigneeDto = Readonly<{ userId: string; displayName: string }>;

export type DashboardAttentionItemDto = Readonly<{
  tenderId: string;
  title: string;
  clientAccountId: string;
  status: TenderStatus;
  submissionDeadline?: string | undefined;
  bucket?: DeadlineBucket | undefined;
  reasons: readonly AttentionReason[];
  readinessScore: number;
  incompleteChecklistCount: number;
  lotPackages: readonly { lotId: string | null; status: ResponsePackageStatus }[];
  /** V2 Sprint 25 — mission §25.59 "acheteur/client", déjà présent sur `TenderListItemDto` (jamais
   *  un second appel), simplement pas encore reporté sur ce DTO avant ce sprint. */
  buyerName?: string | undefined;
  /** V2 Sprint 25 — mission §25.59 "lot" : compte réel de lots avec un dossier de réponse suivi
   *  (`lotPackages.length`), jamais un nom de lot fabriqué (aucune jointure lot->libellé n'existe
   *  sur ce DTO à ce jour). */
  lotCount: number;
  assignees: readonly DashboardAssigneeDto[];
}>;

export type DashboardPackagesDto = Readonly<{
  countByStatus: Readonly<Record<ResponsePackageStatus, number>>;
  total: number;
}>;

export type DashboardGoNoGoDto = Readonly<{
  countByDecision: Readonly<Record<GoNoGoDecisionValue, number>>;
  total: number;
  periodDays: number;
}>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §26/§31/§32) — READ
 * MODEL analytique pur : chaque champ est soit une réutilisation directe d'une donnée déjà résolue
 * plus haut dans `GetDashboardOverviewUseCase` (readinessDistribution/deadlineBuckets/goRate —
 * ZÉRO requête supplémentaire), soit UNE seule agrégation nouvelle et justifiée (activityTrend,
 * via `GetTenderActivityTrendUseCase`, module Tenders). Aucune décision métier : jamais un score,
 * jamais une readiness/GO-NO-GO recalculée — voir ANALYTICS_SOT_MATRIX du rapport final.
 */
export type DashboardReadinessDistributionDto = Readonly<{
  countByStatus: Readonly<Record<ReadinessStatus, number>>;
  total: number;
}>;

export type DashboardDeadlineBucketCountDto = Readonly<{ bucket: DeadlineBucket; count: number }>;

export type DashboardAnalyticsDto = Readonly<{
  periodDays: number;
  /** Mission §4 addendum — UNE série fiable (AO créés/jour), day-bucketée dans le fuseau horaire de
   *  l'organisation (mission §32), toujours `periodDays` points, jamais un jour silencieusement
   *  omis (0 explicite). */
  activityTrend: readonly TenderActivityTrendPointDto[];
  /** Mission §8 addendum — tally de `activeTendersPage.items[].readinessStatus` (non-terminaux,
   *  même périmètre que `attentionItems`/`deadlines`), jamais un second calcul de readiness. */
  readinessDistribution: DashboardReadinessDistributionDto;
  /** Mission §9 addendum — tally de `deadlines[].bucket` (déjà classifié par
   *  `classifyDeadlineBucket`), jamais un second calcul de bucket. */
  deadlineBuckets: readonly DashboardDeadlineBucketCountDto[];
  /** Mission §7 addendum — formule EXACTE et documentée : (GO + GO_CONDITIONAL) / décisions
   *  enregistrées sur la période (= `goNoGo.total`), JAMAIS / tous les Tenders. `null` si aucune
   *  décision n'a été enregistrée sur la période (dénominateur nul — jamais un 0% trompeur). */
  goRate: number | null;
}>;

export type DashboardMyTasksDto = Readonly<{
  overdueCount: number;
  items: readonly TaskSummary[];
}>;

export type DashboardActivityItemDto = Readonly<{
  id: string;
  tenderId: string;
  type: TenderActivityType;
  summary: string;
  createdAt: string;
}>;

/** V2 Sprint 25 (Dashboard Premium) — mission §25.63 "Opportunités recommandées". Dérivé de
 *  `ListSavedSearchMatchesUseCase` (Sprint 17, jamais un second moteur de scoring), scopé aux
 *  veilles de L'ACTEUR COURANT uniquement (même périmètre que `ListSavedSearchesUseCase`). */
export type DashboardRecommendedOpportunityDto = Readonly<{
  externalTenderId: string;
  savedSearchId: string;
  title: string;
  buyerName?: string | undefined;
  score: number;
  /** Libellés des critères réellement satisfaits (mission "tags") — jamais un tag inventé,
   *  toujours un sous-ensemble de `matchReasons` déjà calculé par le moteur de correspondance. */
  matchedLabels: readonly string[];
}>;

export type DashboardMarketWatchDto = Readonly<{
  /** mission §25.64 "Empty Market Watch" — distingue "aucune veille configurée" de "veille(s)
   *  configurée(s) mais sans résultat pertinent en ce moment", deux messages différents. */
  hasSavedSearches: boolean;
  relevantOpportunitiesCount: number;
  recommended: readonly DashboardRecommendedOpportunityDto[];
}>;

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.69/§25.70 "Checklist dynamique... les cases
 * doivent être dérivées de l'état réel... ne pas créer un second état manuel de checklist." Chaque
 * `completed` est calculé à la lecture depuis une source réelle (Tenders/Documents administratifs/
 * Market Watch/Memberships/Company Profile), jamais persisté comme un booléen indépendant.
 */
export const ActivationChecklistItemId = {
  AccountCreated: "ACCOUNT_CREATED",
  OrganizationConfigured: "ORGANIZATION_CONFIGURED",
  CandidateCompanyComplete: "CANDIDATE_COMPANY_COMPLETE",
  AdministrativeDocumentsAdded: "ADMINISTRATIVE_DOCUMENTS_ADDED",
  MarketWatchConfigured: "MARKET_WATCH_CONFIGURED",
  FirstDceImported: "FIRST_DCE_IMPORTED",
  CollaboratorInvited: "COLLABORATOR_INVITED",
} as const;
export type ActivationChecklistItemId = (typeof ActivationChecklistItemId)[keyof typeof ActivationChecklistItemId];

export type DashboardActivationChecklistItemDto = Readonly<{ id: ActivationChecklistItemId; label: string; completed: boolean }>;

export type DashboardActivationChecklistDto = Readonly<{
  items: readonly DashboardActivationChecklistItemDto[];
  completedCount: number;
  totalCount: number;
}>;

export type DashboardOverviewDto = Readonly<{
  generatedAt: string;
  scope: Readonly<{ allClients: boolean; clientAccountId?: string | undefined }>;
  kpis: DashboardKpisDto;
  pipeline: readonly DashboardPipelineStageDto[];
  deadlines: readonly DashboardDeadlineItemDto[];
  attentionItems: readonly DashboardAttentionItemDto[];
  packages: DashboardPackagesDto;
  goNoGo: DashboardGoNoGoDto;
  myTasks: DashboardMyTasksDto;
  activity: readonly DashboardActivityItemDto[];
  marketWatch: DashboardMarketWatchDto;
  activationChecklist: DashboardActivationChecklistDto;
  averageReadinessScore: number;
  analytics: DashboardAnalyticsDto;
}>;

const EMPTY_ACTIVATION_CHECKLIST: DashboardActivationChecklistDto = {
  items: [
    { id: ActivationChecklistItemId.AccountCreated, label: "Compte créé", completed: true },
    { id: ActivationChecklistItemId.OrganizationConfigured, label: "Organisation configurée", completed: true },
    { id: ActivationChecklistItemId.CandidateCompanyComplete, label: "Compléter l'entreprise candidate", completed: false },
    { id: ActivationChecklistItemId.AdministrativeDocumentsAdded, label: "Ajouter les documents administratifs", completed: false },
    { id: ActivationChecklistItemId.MarketWatchConfigured, label: "Configurer la veille", completed: false },
    { id: ActivationChecklistItemId.FirstDceImported, label: "Importer le premier DCE", completed: false },
    { id: ActivationChecklistItemId.CollaboratorInvited, label: "Inviter un collaborateur", completed: false },
  ],
  completedCount: 2,
  totalCount: 7,
};

export const EMPTY_DASHBOARD_OVERVIEW: (generatedAt: string, scope: DashboardOverviewDto["scope"], periodDays: number) => DashboardOverviewDto = (generatedAt, scope, periodDays) => ({
  generatedAt,
  scope,
  kpis: { activeTenders: 0, deadlinesNext7Days: 0, overdueTenders: 0, readyToSubmit: 0, packagesReady: 0, needingAttention: 0, overdueTasks: 0, pendingApprovals: 0 },
  pipeline: [],
  deadlines: [],
  attentionItems: [],
  packages: { countByStatus: {} as Record<ResponsePackageStatus, number>, total: 0 },
  goNoGo: { countByDecision: {} as Record<GoNoGoDecisionValue, number>, total: 0, periodDays },
  myTasks: { overdueCount: 0, items: [] },
  activity: [],
  marketWatch: { hasSavedSearches: false, relevantOpportunitiesCount: 0, recommended: [] },
  activationChecklist: EMPTY_ACTIVATION_CHECKLIST,
  averageReadinessScore: 0,
  analytics: {
    periodDays,
    activityTrend: [],
    readinessDistribution: { countByStatus: {} as Record<ReadinessStatus, number>, total: 0 },
    deadlineBuckets: [],
    goRate: null,
  },
});

export type { TenderListItemDto };
