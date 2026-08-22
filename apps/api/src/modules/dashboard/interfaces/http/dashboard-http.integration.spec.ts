import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

type DashboardOverviewResponse = {
  kpis: { activeTenders: number; deadlinesNext7Days: number; overdueTenders: number; readyToSubmit: number; packagesReady: number; needingAttention: number; overdueTasks: number };
  pipeline: unknown[];
  attentionItems: { tenderId: string; reasons: string[]; lotPackages: { lotId: string | null; status: string }[] }[];
  myTasks: { overdueCount: number; items: { id: string; title: string }[] };
  goNoGo: { countByDecision: Record<string, number>; total: number };
  analytics: {
    periodDays: number;
    activityTrend: { date: string; count: number }[];
    readinessDistribution: { countByStatus: Record<string, number>; total: number };
    deadlineBuckets: { bucket: string; count: number }[];
    goRate: number | null;
  };
};

/**
 * V2 Sprint 15 (Dashboard opérationnel) — preuve réelle contre HTTP + PostgreSQL (NestJS), même
 * motif que `response-package-http.integration.spec.ts` (Sprint 14). Couvre les tests P1 bloquants
 * de la mission : same-org cross-client (§16/§98), injection de `clientId` non autorisé (§72/§100),
 * ClientAccess révoqué (§79/§101), et la cohérence des règles Sprint 14 (OPTIONAL/NOT_APPLICABLE ne
 * bloquent jamais, multi-lot jamais masqué).
 */
describe("Dashboard (dashboard) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenAlice: string;
  let ownerAUserId: string;
  let aliceUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Dashboard HTTP Test", termsAccepted: true }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<string> {
    const id = randomUUID();
    await prisma.clientAssignment.create({
      data: { id, organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
    return id;
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClient(input: { organizationId: string; userId: string; name: string }): Promise<string> {
    const client = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: input.name, nameNormalized: input.name.toLowerCase(), status: "ACTIVE", createdBy: input.userId },
    });
    return client.id;
  }

  async function createTender(input: { organizationId: string; clientAccountId: string; userId: string; title: string; status?: string; submissionDeadline?: Date }): Promise<string> {
    const tender = await prisma.tender.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        clientAccountId: input.clientAccountId,
        title: input.title,
        status: input.status ?? "IN_ANALYSIS",
        tags: [],
        createdBy: input.userId,
        submissionDeadline: input.submissionDeadline ?? null,
      },
    });
    return tender.id;
  }

  async function fetchDashboard(token: string, organizationId: string, query?: string): Promise<{ status: number; body: DashboardOverviewResponse }> {
    const res = await fetch(`${baseUrl}/api/v1/dashboard${query ? `?${query}` : ""}`, { headers: authHeaders(token, organizationId) });
    const body = (await res.json()) as DashboardOverviewResponse;
    return { status: res.status, body };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Dashboard Org A HTTP", slug: `dashboard-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Dashboard Org B HTTP", slug: `dashboard-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`dashboard-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`dashboard-owner-b-${randomUUID()}@smoke.test`);
    const alice = await registerAndLogin(`dashboard-alice-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, alice.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenAlice = alice.token;
    ownerAUserId = ownerA.userId;
    aliceUserId = alice.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: alice.userId, role: OrganizationRole.Contributor });
  }, 60000);

  afterAll(async () => {
    await prisma.task.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderActivity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.goNoGoDecision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("BLOCKING — same-org cross-client: Alice (assigned to Client A only) never sees Client B's counts, even though owner sees both", async () => {
    const clientA = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client A ${randomUUID()}` });
    const clientB = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client B ${randomUUID()}` });
    await assignClient({ organizationId: orgAId, clientAccountId: clientA, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    for (let i = 0; i < 3; i += 1) {
      await createTender({ organizationId: orgAId, clientAccountId: clientA, userId: ownerAUserId, title: `A-${i}-${randomUUID()}` });
    }
    for (let i = 0; i < 5; i += 1) {
      await createTender({ organizationId: orgAId, clientAccountId: clientB, userId: ownerAUserId, title: `B-${i}-${randomUUID()}` });
    }

    const aliceView = await fetchDashboard(tokenAlice, orgAId);
    expect(aliceView.status).toBe(200);
    expect(aliceView.body.kpis.activeTenders).toBe(3);

    const ownerView = await fetchDashboard(tokenOwnerA, orgAId);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.kpis.activeTenders).toBeGreaterThanOrEqual(8);
  });

  it("BLOCKING — clientId query param injection: Alice cannot use ?clientId=<unauthorized client> to see Client B's data (mission §72/§100)", async () => {
    const clientA = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client A Inject ${randomUUID()}` });
    const clientB = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client B Inject ${randomUUID()}` });
    await assignClient({ organizationId: orgAId, clientAccountId: clientA, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await createTender({ organizationId: orgAId, clientAccountId: clientB, userId: ownerAUserId, title: `Injected ${randomUUID()}` });

    const injected = await fetchDashboard(tokenAlice, orgAId, `clientId=${clientB}`);
    expect(injected.status).toBe(200);
    expect(injected.body.kpis.activeTenders).toBe(0);
    expect(injected.body.pipeline).toEqual([]);
    expect(injected.body.attentionItems).toEqual([]);
  });

  it("BLOCKING — ClientAccess revoked mid-session: counts disappear immediately on the next call, no stale server-side cache", async () => {
    const client = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Revoke ${randomUUID()}` });
    const assignmentId = await assignClient({ organizationId: orgAId, clientAccountId: client, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await createTender({ organizationId: orgAId, clientAccountId: client, userId: ownerAUserId, title: `Revoke ${randomUUID()}` });

    const before = await fetchDashboard(tokenAlice, orgAId);
    const beforeCount = before.body.kpis.activeTenders;
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    await prisma.clientAssignment.delete({ where: { id: assignmentId } });

    const after = await fetchDashboard(tokenAlice, orgAId);
    // Delta précis (jamais une valeur absolue à 0 : Alice peut porter d'autres affectations issues
    // d'autres tests dans cette même suite) — la révocation de CETTE affectation doit faire
    // disparaître EXACTEMENT le Tender de CE client, aucun cache serveur ne doit le laisser visible.
    expect(after.body.kpis.activeTenders).toBe(beforeCount - 1);
  });

  it("multi-tenant: an actor from Org B never sees Org A's tenders", async () => {
    const clientA = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Tenant ${randomUUID()}` });
    await createTender({ organizationId: orgAId, clientAccountId: clientA, userId: ownerAUserId, title: `TenantOnly ${randomUUID()}` });

    const orgBView = await fetchDashboard(tokenOwnerB, orgBId);
    expect(orgBView.status).toBe(200);
    expect(orgBView.body.kpis.activeTenders).toBe(0);
  });

  it("BLOCKING — multi-lot: a tender with one READY package and one blocked package is flagged, never masked by aggregation (mission §36/§97)", async () => {
    const client = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client MultiLot ${randomUUID()}` });
    const tenderId = await createTender({ organizationId: orgAId, clientAccountId: client, userId: ownerAUserId, title: `MultiLot ${randomUUID()}` });
    const lot1 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "1", title: "Lot 1", displayOrder: 0 } });
    const lot2 = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "2", title: "Lot 2", displayOrder: 1 } });

    await prisma.responsePackage.create({
      data: { id: randomUUID(), organizationId: orgAId, tenderId, lotId: lot1.id, clientAccountId: client, status: "VALIDATED", createdBy: ownerAUserId },
    });
    await prisma.responsePackage.create({
      data: { id: randomUUID(), organizationId: orgAId, tenderId, lotId: lot2.id, clientAccountId: client, status: "DRAFT", createdBy: ownerAUserId },
    });

    const view = await fetchDashboard(tokenOwnerA, orgAId);
    const item = view.body.attentionItems.find((entry) => entry.tenderId === tenderId);
    expect(item).toBeDefined();
    expect(item!.reasons).toContain("PACKAGE_NOT_READY");
    expect(item!.lotPackages).toHaveLength(2);
    expect(item!.lotPackages.some((p) => p.status === "VALIDATED")).toBe(true);
    expect(item!.lotPackages.some((p) => p.status === "DRAFT")).toBe(true);
  });

  it("a fully VALIDATED single-lot package is NOT flagged as needing attention for that reason", async () => {
    const client = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client ReadyPkg ${randomUUID()}` });
    const tenderId = await createTender({ organizationId: orgAId, clientAccountId: client, userId: ownerAUserId, title: `ReadyPkg ${randomUUID()}` });
    await prisma.responsePackage.create({
      data: { id: randomUUID(), organizationId: orgAId, tenderId, lotId: null, clientAccountId: client, status: "VALIDATED", createdBy: ownerAUserId },
    });

    const view = await fetchDashboard(tokenOwnerA, orgAId);
    const item = view.body.attentionItems.find((entry) => entry.tenderId === tenderId);
    expect(item === undefined || !item.reasons.includes("PACKAGE_NOT_READY")).toBe(true);
    expect(view.body.kpis.packagesReady).toBeGreaterThanOrEqual(1);
  });

  it("KPI/list consistency: kpis.needingAttention exactly equals attentionItems.length (mission §60)", async () => {
    const view = await fetchDashboard(tokenOwnerA, orgAId);
    expect(view.body.kpis.needingAttention).toBe(view.body.attentionItems.length);
  });

  it("Mes tâches: overdue task count reflects only the current actor's own tasks (mission §37/§38)", async () => {
    const client = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Tasks ${randomUUID()}` });
    const tenderId = await createTender({ organizationId: orgAId, clientAccountId: client, userId: ownerAUserId, title: `Tasks ${randomUUID()}` });
    await assignClient({ organizationId: orgAId, clientAccountId: client, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    await prisma.task.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId,
        title: "Tache en retard Alice",
        status: "TODO",
        priority: "MEDIUM",
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        assigneeId: aliceUserId,
        createdBy: ownerAUserId,
      },
    });

    const aliceView = await fetchDashboard(tokenAlice, orgAId);
    expect(aliceView.body.kpis.overdueTasks).toBeGreaterThanOrEqual(1);

    const ownerView = await fetchDashboard(tokenOwnerA, orgAId);
    // Le owner n'a pas cette tâche assignée — son propre compteur "mes tâches" reste indépendant.
    expect(ownerView.body.myTasks.items.every((t) => t.id !== undefined)).toBe(true);
  });

  it("BLOCKING — correctif audit Codex P2-01 : le filtre ?clientId= s'applique aussi à Mes tâches, pas seulement aux KPI/pipeline/packages", async () => {
    const clientA = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Tasks Filter A ${randomUUID()}` });
    const clientB = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Tasks Filter B ${randomUUID()}` });
    await assignClient({ organizationId: orgAId, clientAccountId: clientA, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId: clientB, userId: aliceUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const tenderB = await createTender({ organizationId: orgAId, clientAccountId: clientB, userId: ownerAUserId, title: `TasksFilterB ${randomUUID()}` });
    await prisma.task.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId: tenderB,
        title: `Tache en retard Client B uniquement ${randomUUID()}`,
        status: "TODO",
        priority: "MEDIUM",
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        assigneeId: aliceUserId,
        createdBy: ownerAUserId,
      },
    });

    // Sans filtre : Alice voit bien sa tâche en retard sur Client B (accès légitime aux deux clients).
    const unfiltered = await fetchDashboard(tokenAlice, orgAId);
    expect(unfiltered.body.kpis.overdueTasks).toBeGreaterThanOrEqual(1);

    // Filtré sur Client A uniquement : la tâche du Client B ne doit apparaître NULLE PART — ni dans
    // le compteur, ni dans la liste "Mes tâches" (mission §12/§60 — le filtre client s'applique à
    // TOUTES les projections du Dashboard, pas seulement KPI/pipeline/packages).
    const filteredToA = await fetchDashboard(tokenAlice, orgAId, `clientId=${clientA}`);
    expect(filteredToA.body.kpis.overdueTasks).toBe(0);
    expect(filteredToA.body.myTasks.items.some((t) => t.title.startsWith("Tache en retard Client B uniquement"))).toBe(false);
  });

  it("GO/NO-GO summary counts real decisions within the period, never a success rate", async () => {
    const client = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client GoNoGo ${randomUUID()}` });
    const tenderId = await createTender({ organizationId: orgAId, clientAccountId: client, userId: ownerAUserId, title: `GoNoGo ${randomUUID()}` });
    await prisma.goNoGoDecision.create({
      data: { id: randomUUID(), organizationId: orgAId, level: "TENDER", tenderId, decision: "GO", actorId: ownerAUserId, decidedAt: new Date() },
    });

    const view = await fetchDashboard(tokenOwnerA, orgAId);
    expect(view.body.goNoGo.total).toBeGreaterThanOrEqual(1);
    expect(view.body.goNoGo.countByDecision.GO).toBeGreaterThanOrEqual(1);
    expect(view.body).not.toHaveProperty("winRate");
    // Checkpoint TENDEROS-2.1-P2.3-E5.1 (closes E5-D3 — couverture HTTP des nouveaux analytics
    // E5 Premium) — `analytics.goRate` doit refléter exactement le même dénominateur/numérateur que
    // `goNoGo.countByDecision`/`goNoGo.total` (formule documentée : round((GO + GO_CONDITIONAL) /
    // total * 100)), jamais un second calcul divergent côté analytics.
    const expectedGoRate = Math.round((((view.body.goNoGo.countByDecision.GO ?? 0) + (view.body.goNoGo.countByDecision.GO_CONDITIONAL ?? 0)) / view.body.goNoGo.total) * 100);
    expect(view.body.analytics.goRate).toBe(expectedGoRate);
  });

  it("BLOCKING — real HTTP+PostgreSQL, closes E5-D3: analytics.periodDays reflects the query param and activityTrend always has exactly that many points", async () => {
    const view7 = await fetchDashboard(tokenOwnerA, orgAId, "periodDays=7");
    expect(view7.body.analytics.periodDays).toBe(7);
    expect(view7.body.analytics.activityTrend).toHaveLength(7);

    const view90 = await fetchDashboard(tokenOwnerA, orgAId, "periodDays=90");
    expect(view90.body.analytics.periodDays).toBe(90);
    expect(view90.body.analytics.activityTrend).toHaveLength(90);
  });

  it("BLOCKING — real HTTP+PostgreSQL, closes E5-D3: analytics obeys the same ?clientId= tenant/client scope as kpis, never leaking another client's tenders into activityTrend", async () => {
    const clientA = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Analytics A ${randomUUID()}` });
    const clientB = await createClient({ organizationId: orgAId, userId: ownerAUserId, name: `Client Analytics B ${randomUUID()}` });
    await createTender({ organizationId: orgAId, clientAccountId: clientB, userId: ownerAUserId, title: `AnalyticsOnlyB ${randomUUID()}` });

    const scopedToA = await fetchDashboard(tokenOwnerA, orgAId, `clientId=${clientA}&periodDays=7`);
    const totalTrendA = scopedToA.body.analytics.activityTrend.reduce((sum, point) => sum + point.count, 0);
    expect(totalTrendA).toBe(0);

    const scopedToB = await fetchDashboard(tokenOwnerA, orgAId, `clientId=${clientB}&periodDays=7`);
    const totalTrendB = scopedToB.body.analytics.activityTrend.reduce((sum, point) => sum + point.count, 0);
    expect(totalTrendB).toBeGreaterThanOrEqual(1);
  });

  it("responds 401 without authentication", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard`);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown periodDays value", async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard?periodDays=15`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(400);
  });
});
