import { describe, expect, it, vi } from "vitest";
import { GetDashboardOverviewUseCase } from "./get-dashboard-overview.use-case";

function stub<T>(value: T): { execute: ReturnType<typeof vi.fn> } {
  return { execute: vi.fn(async () => value) };
}

function buildUseCase(overrides: Partial<Record<string, { execute: ReturnType<typeof vi.fn> }>> = {}) {
  const defaults = {
    listAccessibleClientsUseCase: stub({ allClients: true, clientAccountIds: [] }),
    getTenderStatisticsUseCase: stub({ totalActive: 0, byStatus: {}, deadlinesNext7Days: 0, overdueCount: 0, readyToSubmitCount: 0, atRiskCount: 0, averageReadinessScore: 0 }),
    getTenderListViewUseCase: stub({ items: [], nextCursor: null }),
    getMyTasksUseCase: stub([]),
    // Checkpoint TENDEROS-2.1-P2.3-E12.1 — le Dashboard consomme désormais `count()` (COUNT(*) SQL)
    // et non plus `execute()` : il n'a jamais eu besoin que du nombre de validations en attente.
    listMyApprovalsUseCase: { ...stub([]), count: async () => 0 },
    listRecentActivityForDashboardUseCase: stub([]),
    // Checkpoint TENDEROS-2.1-P2.3-E12 — le portefeuille renvoie désormais des AGRÉGATS calculés par
    // PostgreSQL (`countByStatus`/`total`, état courant global) plus les seules lignes des Tenders
    // affichés, jamais la liste complète du portefeuille.
    getResponsePackagePortfolioSummaryForDashboardUseCase: stub({ countByStatus: {}, total: 0, rowsForTenders: [] }),
    getGoNoGoSummaryForDashboardUseCase: stub({ countByDecision: {}, total: 0 }),
    listTenderParticipantsUseCase: stub([]),
    getCurrentUserUseCase: stub({ id: "user-1", displayName: "Test User" }),
    listSavedSearchesUseCase: stub([]),
    listSavedSearchMatchesUseCase: stub({ items: [], nextCursor: null }),
    countActiveMembersUseCase: stub(1),
    listClientAccountsUseCase: stub({ items: [], nextCursor: null }),
    getCompanyProfileUseCase: stub({ completeness: { identity: "INCOMPLETE" } }),
    hasAnyAdministrativeDocumentUseCase: stub(false),
    getTenderActivityTrendUseCase: stub([]),
    getOrganizationUseCase: stub({ id: "org-1", name: "Test Org", slug: "test-org", defaultTimezone: "Europe/Paris" }),
  };
  const deps = { ...defaults, ...overrides };
  return new GetDashboardOverviewUseCase(
    deps.listAccessibleClientsUseCase as never,
    deps.getTenderStatisticsUseCase as never,
    deps.getTenderListViewUseCase as never,
    deps.getMyTasksUseCase as never,
    deps.listMyApprovalsUseCase as never,
    deps.listRecentActivityForDashboardUseCase as never,
    deps.getResponsePackagePortfolioSummaryForDashboardUseCase as never,
    deps.getGoNoGoSummaryForDashboardUseCase as never,
    deps.listTenderParticipantsUseCase as never,
    deps.getCurrentUserUseCase as never,
    deps.listSavedSearchesUseCase as never,
    deps.listSavedSearchMatchesUseCase as never,
    deps.countActiveMembersUseCase as never,
    deps.listClientAccountsUseCase as never,
    deps.getCompanyProfileUseCase as never,
    deps.hasAnyAdministrativeDocumentUseCase as never,
    deps.getTenderActivityTrendUseCase as never,
    deps.getOrganizationUseCase as never,
    { now: () => new Date("2026-06-15T12:00:00.000Z") } as never,
  );
}

describe("GetDashboardOverviewUseCase — Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2)", () => {
  it("BLOQUANT — correctif RBAC : an actor whose role has NO MarketWatchPermission (e.g. EXTERNAL_CONSULTANT/READ_ONLY) never crashes the whole dashboard — marketWatch degrades to hasSavedSearches:false instead of propagating the error", async () => {
    const listSavedSearchesUseCase = { execute: vi.fn(async () => { throw new Error("Simulated MarketWatchPermissionMissingError (test-only)"); }) };
    const useCase = buildUseCase({ listSavedSearchesUseCase });

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "EXTERNAL_CONSULTANT" });

    expect(result.marketWatch).toEqual({ hasSavedSearches: false, relevantOpportunitiesCount: 0, recommended: [] });
    // La panne d'UN sous-système ne doit jamais empêcher le reste du Dashboard de se construire.
    expect(result.kpis).toBeDefined();
    expect(result.analytics).toBeDefined();
  });

  it("returns a fully-populated analytics object on the happy path, traceable to its SOT stubs", async () => {
    const getTenderActivityTrendUseCase = stub([{ date: "2026-06-15", count: 2 }]);
    const getGoNoGoSummaryForDashboardUseCase = stub({ countByDecision: { GO: 3, GO_CONDITIONAL: 1, NO_GO: 1 }, total: 5 });
    const useCase = buildUseCase({ getTenderActivityTrendUseCase, getGoNoGoSummaryForDashboardUseCase });

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER" });

    expect(result.analytics.activityTrend).toEqual([{ date: "2026-06-15", count: 2 }]);
    // Mission §7 addendum — formule EXACTE : (GO + GO_CONDITIONAL) / total = (3 + 1) / 5 = 80%.
    expect(result.analytics.goRate).toBe(80);
    expect(result.analytics.readinessDistribution).toEqual({ countByStatus: {}, total: 0 });
    expect(result.analytics.deadlineBuckets.length).toBeGreaterThan(0);
  });

  it("goRate is null (never a misleading 0%) when no GO/NO-GO decision was recorded on the period", async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER" });

    expect(result.analytics.goRate).toBeNull();
  });

  it("BLOQUANT — tenant/ClientAccess scoping: an actor with zero accessible clients gets the empty overview, never a partial/leaking payload", async () => {
    const listAccessibleClientsUseCase = stub({ allClients: false, clientAccountIds: [] });
    const useCase = buildUseCase({ listAccessibleClientsUseCase });

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "CONTRIBUTOR" });

    expect(result.kpis.activeTenders).toBe(0);
    expect(result.analytics.activityTrend).toEqual([]);
    expect(result.analytics.goRate).toBeNull();
  });
});
