import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

type DashboardOverviewResponse = {
  scope: { allClients: boolean; clientAccountId?: string };
  kpis: { packagesReady: number; activeTenders: number };
  packages: { countByStatus: Record<string, number>; total: number };
  attentionItems: { tenderId: string; lotPackages: { lotId: string | null; status: string }[] }[];
  analytics: { periodDays: number; activityTrend: { date: string; count: number }[] };
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E12 (Dashboard unbounded query) — preuve réelle en HTTP +
 * PostgreSQL que le chemin Dashboard ne matérialise PLUS tout l'historique du portefeuille.
 *
 * La règle produit appliquée ici :
 *  - analytics temporelles = 7 / 30 / 90 jours UNIQUEMENT, 90 = maximum, `periodDays`
 *    backend-authoritative (aucune valeur arbitraire acceptée depuis le client) ;
 *  - les KPI d'ÉTAT COURANT (`packages.total`, `kpis.packagesReady`) ne subissent AUCUN cutoff
 *    artificiel de 90 jours : un dossier prêt depuis deux ans reste un dossier prêt. Leur
 *    définition métier est inchangée — seul leur mode de calcul l'est (agrégat PostgreSQL au lieu
 *    d'un chargement complet en mémoire).
 *
 * Le test central (`SQL RÉEL`) n'infère RIEN d'un test unitaire : il branche un écouteur sur les
 * événements de requête Prisma et inspecte le SQL effectivement exécuté pendant une vraie requête
 * HTTP Dashboard.
 */
describe("Dashboard — query bounding (Checkpoint TENDEROS-2.1-P2.3-E12) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenScopedA: string;
  let ownerAUserId: string;
  let clientA1Id: string;
  let clientA2Id: string;

  /** Historique volontairement plus grand que `ACTIVE_TENDERS_SCAN_LIMIT` (300) : c'est ce qui rend
   *  la borne observable — les compteurs d'état courant doivent porter sur les 360 dossiers, alors
   *  que les lignes détaillées ne peuvent en matérialiser qu'au plus 300. */
  const HISTORY_TENDERS = 360;
  const RECENT_TENDERS = 3;
  const OLD_DAYS = 400;

  const capturedSql: string[] = [];
  let capturing = false;

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Dashboard Bounding Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 3600_000) } });
    userIds.push(userId);
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  async function fetchDashboard(token: string, organizationId: string, query?: string): Promise<{ status: number; body: DashboardOverviewResponse }> {
    const res = await fetch(`${baseUrl}/api/v1/dashboard${query ? `?${query}` : ""}`, { headers: authHeaders(token, organizationId) });
    return { status: res.status, body: (await res.json()) as DashboardOverviewResponse };
  }

  /** Les événements de requête Prisma sont émis de façon asynchrone : on laisse la boucle
   *  d'événements se vider avant d'inspecter, jamais une assertion sur une capture partielle. */
  async function captureSqlDuring(fn: () => Promise<unknown>): Promise<string[]> {
    capturedSql.length = 0;
    capturing = true;
    try {
      await fn();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      capturing = false;
    }
    return [...capturedSql];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    prisma = moduleRef.get(PrismaService);
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);
    prisma.$on("query", (event) => {
      if (capturing) capturedSql.push(event.query);
    });

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Dashboard Bounding Org A", slug: `dashboard-bounding-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Dashboard Bounding Org B", slug: `dashboard-bounding-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const membershipRepository = new PrismaMembershipRepository(prisma);
    const ownerA = await createActor(`dashboard-bounding-owner-a-${randomUUID()}@smoke.test`);
    ownerAUserId = ownerA.userId;
    tokenOwnerA = ownerA.token;
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner, occurredAt: new Date() }));

    const ownerB = await createActor(`dashboard-bounding-owner-b-${randomUUID()}@smoke.test`);
    tokenOwnerB = ownerB.token;
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner, occurredAt: new Date() }));

    // Acteur client-scopé : CONTRIBUTOR ne voit que les clients qui lui sont explicitement assignés
    // (jamais `allClients`), ce qui permet de prouver le rétrécissement ClientAccess réel.
    const scopedA = await createActor(`dashboard-bounding-scoped-a-${randomUUID()}@smoke.test`);
    tokenScopedA = scopedA.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: scopedA.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );

    const [clientA1, clientA2] = await Promise.all([
      prisma.clientAccount.create({ data: { id: randomUUID(), organizationId: orgAId, name: "Client A1", nameNormalized: "client a1", status: "ACTIVE", createdBy: ownerAUserId } }),
      prisma.clientAccount.create({ data: { id: randomUUID(), organizationId: orgAId, name: "Client A2", nameNormalized: "client a2", status: "ACTIVE", createdBy: ownerAUserId } }),
    ]);
    clientA1Id = clientA1.id;
    clientA2Id = clientA2.id;

    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: scopedA.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId },
    });

    // ---- Historique volumineux et ANCIEN (400 jours) : c'est exactement ce que le Dashboard ne
    // doit plus jamais charger intégralement en mémoire, tout en continuant à le COMPTER.
    const oldDate = new Date(Date.now() - OLD_DAYS * 24 * 60 * 60 * 1000);
    const historyTenderIds = Array.from({ length: HISTORY_TENDERS }, () => randomUUID());
    await prisma.tender.createMany({
      data: historyTenderIds.map((id, index) => ({
        id,
        organizationId: orgAId,
        // Réparti sur les deux clients pour prouver le filtre `clientId` en SQL.
        clientAccountId: index % 2 === 0 ? clientA1Id : clientA2Id,
        title: `Historique ${index}`,
        status: "ARCHIVED",
        tags: [],
        createdBy: ownerAUserId,
        createdAt: oldDate,
        updatedAt: oldDate,
      })),
    });
    await prisma.responsePackage.createMany({
      data: historyTenderIds.map((tenderId, index) => ({
        id: randomUUID(),
        organizationId: orgAId,
        tenderId,
        lotId: null,
        clientAccountId: index % 2 === 0 ? clientA1Id : clientA2Id,
        status: "EXPORTED",
        createdBy: ownerAUserId,
        createdAt: oldDate,
        updatedAt: oldDate,
      })),
    });

    // ---- Quelques Tenders RÉCENTS (aujourd'hui) : seuls ceux-ci doivent peser sur les analytics
    // temporelles.
    const recentTenderIds = Array.from({ length: RECENT_TENDERS }, () => randomUUID());
    await prisma.tender.createMany({
      data: recentTenderIds.map((id, index) => ({
        id,
        organizationId: orgAId,
        clientAccountId: clientA1Id,
        title: `Récent ${index}`,
        status: "IN_ANALYSIS",
        tags: [],
        createdBy: ownerAUserId,
      })),
    });
    await prisma.responsePackage.createMany({
      data: recentTenderIds.map((tenderId) => ({
        id: randomUUID(),
        organizationId: orgAId,
        tenderId,
        lotId: null,
        clientAccountId: clientA1Id,
        status: "READY",
        createdBy: ownerAUserId,
      })),
    });
  }, 180000);

  afterAll(async () => {
    await prisma.responsePackage.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 120000);

  // ---------------------------------------------------------------------------------------------
  // Fenêtre d'analytics temporelles — backend-authoritative
  // ---------------------------------------------------------------------------------------------

  it.each([7, 30, 90])("BLOQUANT — periodDays=%i ne projette QUE la fenêtre demandée (un point par jour, ni plus ni moins)", async (periodDays) => {
    const { status, body } = await fetchDashboard(tokenOwnerA, orgAId, `periodDays=${periodDays}`);

    expect(status).toBe(200);
    expect(body.analytics.periodDays).toBe(periodDays);
    expect(body.analytics.activityTrend).toHaveLength(periodDays);

    // Le point le plus ancien est exactement à J-(periodDays-1) — la fenêtre n'est jamais élargie
    // silencieusement au-delà de ce que le client a demandé.
    const oldestExpected = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(Date.now() - (periodDays - 1) * 24 * 60 * 60 * 1000),
    );
    expect(body.analytics.activityTrend[0]!.date).toBe(oldestExpected);
  });

  it("BLOQUANT — 90 jours est la fenêtre MAXIMALE : toute valeur supérieure ou arbitraire est refusée, jamais silencieusement acceptée", async () => {
    for (const rejected of [91, 180, 365, 3650, 0, -30, 45]) {
      const res = await fetch(`${baseUrl}/api/v1/dashboard?periodDays=${rejected}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status, `periodDays=${rejected} must be rejected`).toBe(400);
    }
  });

  it("periodDays est backend-authoritative : absent de la requête, le défaut serveur (30) s'applique", async () => {
    const { body } = await fetchDashboard(tokenOwnerA, orgAId);
    expect(body.analytics.periodDays).toBe(30);
    expect(body.analytics.activityTrend).toHaveLength(30);
  });

  it("BLOQUANT — les données de plus de 90 jours n'affectent JAMAIS les analytics temporelles", async () => {
    const { body } = await fetchDashboard(tokenOwnerA, orgAId, "periodDays=90");

    // 360 Tenders vieux de 400 jours existent réellement en base ; aucun ne doit peser sur la
    // tendance. Seuls les 3 Tenders récents sont comptés.
    const totalInTrend = body.analytics.activityTrend.reduce((sum, point) => sum + point.count, 0);
    expect(totalInTrend).toBe(RECENT_TENDERS);
  });

  // ---------------------------------------------------------------------------------------------
  // KPI d'état courant — aucun faux cutoff
  // ---------------------------------------------------------------------------------------------

  it("BLOQUANT — les KPI d'ÉTAT COURANT gardent leur définition métier globale : aucun cutoff artificiel à 90 jours", async () => {
    const { body } = await fetchDashboard(tokenOwnerA, orgAId, "periodDays=7");

    // Vérité terrain lue directement en base, jamais une constante recopiée depuis le code testé.
    const trueTotal = await prisma.responsePackage.count({ where: { organizationId: orgAId } });
    const trueReady = await prisma.responsePackage.count({ where: { organizationId: orgAId, status: { in: ["READY", "VALIDATED", "EXPORTED"] } } });

    expect(trueTotal).toBe(HISTORY_TENDERS + RECENT_TENDERS);
    // Même avec la fenêtre d'analytics la plus courte (7 jours), l'état courant reste GLOBAL.
    expect(body.packages.total).toBe(trueTotal);
    expect(body.kpis.packagesReady).toBe(trueReady);
    expect(body.packages.countByStatus.EXPORTED).toBe(HISTORY_TENDERS);
    expect(body.packages.countByStatus.READY).toBe(RECENT_TENDERS);
  });

  // ---------------------------------------------------------------------------------------------
  // SQL RÉEL — la preuve que l'historique n'est plus matérialisé
  // ---------------------------------------------------------------------------------------------

  it("BLOQUANT — SQL RÉEL : les compteurs de portefeuille sont agrégés par PostgreSQL (GROUP BY), jamais comptés en mémoire", async () => {
    const sql = await captureSqlDuring(() => fetchDashboard(tokenOwnerA, orgAId, "periodDays=30"));

    const packageQueries = sql.filter((statement) => statement.includes('"response_packages"'));
    expect(packageQueries.length, "the dashboard must actually query response_packages").toBeGreaterThan(0);

    const aggregates = packageQueries.filter((statement) => /GROUP BY/i.test(statement));
    expect(aggregates.length, `expected a GROUP BY aggregate, got:\n${packageQueries.join("\n")}`).toBeGreaterThan(0);
  });

  it("BLOQUANT — SQL RÉEL : aucune lecture NON BORNÉE de response_packages ne subsiste sur le chemin Dashboard", async () => {
    const sql = await captureSqlDuring(() => fetchDashboard(tokenOwnerA, orgAId, "periodDays=30"));

    // Toute lecture de lignes (par opposition à une agrégation) DOIT être bornée par la liste des
    // Tenders réellement affichés. C'est précisément ce qui manquait avant ce correctif :
    // `listForDashboard` lisait tout le portefeuille de l'organisation sans aucune borne.
    const unbounded = sql.filter((statement) => statement.includes('"response_packages"') && !/GROUP BY/i.test(statement) && !/"tender_id" IN/i.test(statement));

    expect(unbounded, `unbounded response_packages read(s) still on the dashboard path:\n${unbounded.join("\n")}`).toEqual([]);
  });

  it("BLOQUANT — SQL RÉEL : le nombre de lignes de dossiers matérialisées reste borné par la fenêtre de scan, jamais par la taille de l'historique", async () => {
    const { body } = await fetchDashboard(tokenOwnerA, orgAId, "periodDays=30");

    // 363 dossiers existent ; les lignes détaillées effectivement rendues (lots attachés aux
    // dossiers prioritaires) ne peuvent pas dépasser la fenêtre de scan Tenders (300), et le
    // compteur global reste exact malgré tout.
    const materializedLotRows = body.attentionItems.reduce((sum, item) => sum + item.lotPackages.length, 0);
    expect(body.packages.total).toBe(HISTORY_TENDERS + RECENT_TENDERS);
    expect(materializedLotRows).toBeLessThanOrEqual(300);
  });

  it("le filtre clientId est appliqué par PostgreSQL, jamais en mémoire après avoir chargé tout le portefeuille", async () => {
    const sql = await captureSqlDuring(() => fetchDashboard(tokenOwnerA, orgAId, `periodDays=30&clientId=${clientA2Id}`));

    const aggregate = sql.find((statement) => statement.includes('"response_packages"') && /GROUP BY/i.test(statement));
    expect(aggregate).toBeDefined();
    expect(aggregate, "the client filter must reach SQL").toMatch(/"client_account_id"/i);
  });

  // ---------------------------------------------------------------------------------------------
  // Sécurité — inchangée par ce correctif
  // ---------------------------------------------------------------------------------------------

  it("BLOQUANT — le scope clientId reste appliqué : les compteurs ne portent que sur le client demandé", async () => {
    const { body } = await fetchDashboard(tokenOwnerA, orgAId, `clientId=${clientA2Id}`);

    const trueA2 = await prisma.responsePackage.count({ where: { organizationId: orgAId, clientAccountId: clientA2Id } });
    expect(body.scope.clientAccountId).toBe(clientA2Id);
    expect(body.packages.total).toBe(trueA2);
    expect(body.packages.total).toBeLessThan(HISTORY_TENDERS + RECENT_TENDERS);
  });

  it("BLOQUANT — un clientId hors périmètre accessible RÉTRÉCIT à zéro, il n'élargit jamais la portée", async () => {
    // L'acteur n'est assigné qu'à Client A1 ; il demande explicitement Client A2.
    const { status, body } = await fetchDashboard(tokenScopedA, orgAId, `clientId=${clientA2Id}`);

    expect(status).toBe(200);
    expect(body.packages.total).toBe(0);
    expect(body.kpis.packagesReady).toBe(0);
  });

  it("BLOQUANT — ClientAccess : un acteur client-scopé ne voit QUE le portefeuille de ses clients assignés", async () => {
    const { body } = await fetchDashboard(tokenScopedA, orgAId);

    const trueA1 = await prisma.responsePackage.count({ where: { organizationId: orgAId, clientAccountId: clientA1Id } });
    expect(body.packages.total).toBe(trueA1);
    expect(body.packages.total).toBeLessThan(HISTORY_TENDERS + RECENT_TENDERS);
  });

  it("BLOQUANT — isolation tenant : Org B ne voit jamais un seul dossier d'Org A", async () => {
    const { status, body } = await fetchDashboard(tokenOwnerB, orgBId);

    expect(status).toBe(200);
    expect(body.packages.total).toBe(0);
    expect(body.kpis.packagesReady).toBe(0);
  });

  it("BLOQUANT — RBAC : un acteur non membre de l'organisation n'atteint jamais le Dashboard", async () => {
    // Convention anti-énumération du dépôt : 404, jamais 403 — un 403 confirmerait l'existence de
    // l'organisation d'un autre tenant.
    const res = await fetch(`${baseUrl}/api/v1/dashboard`, { headers: authHeaders(tokenOwnerB, orgAId) });
    expect(res.status).toBe(404);
  });
});
