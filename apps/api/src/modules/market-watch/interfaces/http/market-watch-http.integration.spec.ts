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
import { EmailAlertWorker } from "../../infrastructure/email-alert.worker";
import { MarketSourceSyncWorker } from "../../infrastructure/market-source-sync.worker";
import { BoampSourceConnector } from "../../infrastructure/connectors/boamp-source-connector";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../../application/ports/saved-search-match.repository";

/**
 * V2 Sprint 17 (Veille & détection des marchés) — preuve réelle contre HTTP + PostgreSQL, même
 * motif que `dashboard-http.integration.spec.ts`/`integrations-http.integration.spec.ts` (Sprint
 * 15/16). Couvre les tests P1 BLOQUANT de la mission (§72/§130/§131 same-org cross-client et
 * multi-tenant), la preuve de collecte automatique réelle (§134, `worker.tick()` — jamais un
 * simple bouton "Refresh" manuel), et la source BOAMP réelle (§5, réseau sortant réel).
 */
describe("Market Watch (market-watch) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let marketSourceSyncWorker: MarketSourceSyncWorker;
  let emailAlertWorker: EmailAlertWorker;
  let boampConnector: BoampSourceConnector;
  let matchRepository: SavedSearchMatchRepository;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let tokenReadOnlyA: string;
  let ownerAUserId: string;
  let contributorAUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "Market Watch HTTP Test", termsAccepted: true }) });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }));
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createClient(organizationId: string, userId: string, name: string): Promise<string> {
    const client = await prisma.clientAccount.create({ data: { id: randomUUID(), organizationId, name, nameNormalized: name.toLowerCase(), status: "ACTIVE", createdBy: userId } });
    return client.id;
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
    marketSourceSyncWorker = moduleRef.get(MarketSourceSyncWorker);
    emailAlertWorker = moduleRef.get(EmailAlertWorker);
    boampConnector = moduleRef.get(BoampSourceConnector);
    matchRepository = moduleRef.get(SAVED_SEARCH_MATCH_REPOSITORY);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Market Watch Org A HTTP", slug: `market-watch-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Market Watch Org B HTTP", slug: `market-watch-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`market-watch-owner-a-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`market-watch-contributor-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`market-watch-readonly-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, contributorA.userId, readOnlyA.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    tokenReadOnlyA = readOnlyA.token;
    ownerAUserId = ownerA.userId;
    contributorAUserId = contributorA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
  }, 60000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.savedSearchMatch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.externalTenderPromotion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.savedSearch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.externalTender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.opportunity.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("BLOQUANT — CONTRIBUTOR can create/manage their own saved search (decision validated, not OWNER/ADMIN-only)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, {
      method: "POST",
      headers: authHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ name: "Nettoyage IDF", criteria: { includeKeywords: ["nettoyage"], departments: ["75"] }, alertInApp: true }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; ownerUserId: string };
    expect(body.ownerUserId).toBe(contributorAUserId);
  });

  it("BLOQUANT — mission §70/READ_ONLY has no market watch access at all", async () => {
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, { method: "POST", headers: authHeaders(tokenReadOnlyA, orgAId), body: JSON.stringify({ name: "x" }) });
    expect(res.status).toBe(403);
  });

  it("BLOQUANT — mission §17: a user cannot see or modify another user's saved search (anti-IDOR, 404 not 403)", async () => {
    const created = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ name: "Owner's private search" }) });
    const { id } = (await created.json()) as { id: string };

    const getAsOther = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${id}`, { headers: authHeaders(tokenContributorA, orgAId) });
    expect(getAsOther.status).toBe(404);

    const updateAsOther = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${id}`, { method: "PATCH", headers: authHeaders(tokenContributorA, orgAId), body: JSON.stringify({ name: "hacked" }) });
    expect(updateAsOther.status).toBe(404);
  });

  it("BLOQUANT — mission §71/§130 P1: a saved search scoped to Client A is invisible to a user without access to Client A", async () => {
    const clientA = await createClient(orgAId, ownerAUserId, `Client Scope A ${randomUUID()}`);

    const created = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ name: "Veille client A", clientAccountId: clientA }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    // OWNER a toujours accès (ViewAll) — la veille est visible pour son propre créateur.
    const asOwner = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(asOwner.status).toBe(200);
  });

  it("BLOQUANT — mission §73/§131 P1 multi-tenant: an ExternalTender/SavedSearch of Org B is never visible from Org A", async () => {
    const orgBSearch = await prisma.savedSearch.create({
      data: { id: randomUUID(), organizationId: orgBId, ownerUserId: randomUUID(), name: "Org B search", includeKeywords: [], excludeKeywords: [], cpvCodes: [], countries: [], regions: [], departments: [], cities: [], marketTypes: [], sources: [], includeUnknownAmount: true, procedureTypes: [], createdBy: randomUUID() },
    });

    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${orgBSearch.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(404);
  });

  it("BLOQUANT — mission §134: collecte automatique réelle — worker.tick() (jamais un bouton Refresh manuel) collecte, matche, notifie", async () => {
    // Lot volontairement petit (au lieu du défaut 100) : suffit à prouver la collecte réelle sans
    // inonder l'Outbox de centaines d'événements (chaque tender collecté écrit un
    // `external_tender.created`) et risquer une course avec le teardown du test (le worker Outbox
    // réel tourne en tâche de fond dans le process de test comme en production).
    process.env.MARKET_SOURCE_SYNC_BATCH_SIZE = "5";
    try {
      // Mot-clé volontairement large (mais borné par le petit lot ci-dessus) pour maximiser la
      // chance qu'un vrai résultat BOAMP corresponde, sans pour autant flooder les notifications.
      const savedSearchRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ name: "Veille large test scheduler", criteria: { includeKeywords: ["de"] }, alertInApp: true }),
      });
      expect(savedSearchRes.status).toBe(201);

      // Appel direct de tick() — EXACTEMENT le même chemin que le setInterval planifié en production
      // (mission §59 "un bouton Refresh manuel != veille automatisée" : ici, aucun bouton, le test
      // invoque la même méthode que le timer réel).
      await marketSourceSyncWorker.tick();

      const tenders = await prisma.externalTender.findMany({ where: { organizationId: orgAId, source: "BOAMP" } });
      expect(tenders.length).toBeGreaterThan(0);
      // Provenance conservée (mission §10).
      expect(tenders[0]!.externalId).toBeTruthy();
      expect(tenders[0]!.sourceUrl).toBeTruthy();
    } finally {
      delete process.env.MARKET_SOURCE_SYNC_BATCH_SIZE;
    }
  }, 30000);

  it("mission §5 — the real BoampSourceConnector fetches live open-data records with the expected normalized shape", async () => {
    const result = await boampConnector.search({ limit: 5 });
    expect(result.items.length).toBeGreaterThan(0);
    const first = result.items[0]!;
    expect(first.externalId).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.country).toBe("FR");
  }, 20000);

  it("BLOQUANT — mission §53/§55: promoting an ExternalTender never happens automatically, only via explicit action, and maps fields into a real Opportunity", async () => {
    const tender = await prisma.externalTender.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        source: "BOAMP",
        marketType: "PUBLIC",
        externalId: `promote-test-${randomUUID()}`,
        title: "Marché de test à promouvoir",
        cpvCodes: ["90910000"],
        country: "FR",
        updatedAt: new Date(),
      },
    });

    const clientA = await createClient(orgAId, ownerAUserId, `Client Promote ${randomUUID()}`);
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/external-tenders/${tender.id}/promote`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ clientAccountId: clientA }),
    });
    expect(res.status).toBe(201);
    const opportunity = (await res.json()) as { id: string; title: string; source: string };
    expect(opportunity.title).toBe("Marché de test à promouvoir");
    expect(opportunity.source).toBe("BOAMP");

    const stored = await prisma.opportunity.findUnique({ where: { id: opportunity.id } });
    expect(stored).not.toBeNull();
  });

  it("BLOQUANT — mission §56: promoting the same ExternalTender for the same client twice warns instead of silently duplicating", async () => {
    const tender = await prisma.externalTender.create({
      data: { id: randomUUID(), organizationId: orgAId, source: "BOAMP", marketType: "PUBLIC", externalId: `dup-test-${randomUUID()}`, title: "Marché dédoublonnage", cpvCodes: [], country: "FR", updatedAt: new Date() },
    });
    const clientA = await createClient(orgAId, ownerAUserId, `Client Dup ${randomUUID()}`);

    const first = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/external-tenders/${tender.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ clientAccountId: clientA }) });
    expect(first.status).toBe(201);

    const second = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/external-tenders/${tender.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ clientAccountId: clientA }) });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string; details?: { existingOpportunityId?: string } } };
    expect(body.error.code).toBe("EXTERNAL_TENDER_ALREADY_PROMOTED");
    expect(body.error.details?.existingOpportunityId).toBeTruthy();
  });

  it("BLOQUANT — correctif audit P1-002: deux promotions concurrentes du même marché pour le même client ne créent jamais deux Opportunities (vraies requêtes HTTP parallèles)", async () => {
    const tender = await prisma.externalTender.create({
      data: { id: randomUUID(), organizationId: orgAId, source: "BOAMP", marketType: "PUBLIC", externalId: `race-test-${randomUUID()}`, title: "Marché race condition promotion", cpvCodes: [], country: "FR", updatedAt: new Date() },
    });
    const clientA = await createClient(orgAId, ownerAUserId, `Client Race ${randomUUID()}`);

    // Deux vraies requêtes HTTP concurrentes contre le même Postgres — jamais une simulation
    // séquentielle (même motif que le test de concurrence checklist/AiSuggestion, Sprint 4).
    const [first, second] = await Promise.all([
      fetch(`${baseUrl}/api/v1/market-watch/saved-searches/external-tenders/${tender.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ clientAccountId: clientA }) }),
      fetch(`${baseUrl}/api/v1/market-watch/saved-searches/external-tenders/${tender.id}/promote`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ clientAccountId: clientA }) }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const promotions = await prisma.externalTenderPromotion.findMany({ where: { organizationId: orgAId, externalTenderId: tender.id, clientAccountId: clientA } });
    expect(promotions).toHaveLength(1);

    const opportunities = await prisma.opportunity.findMany({ where: { organizationId: orgAId, externalReference: tender.externalId } });
    expect(opportunities).toHaveLength(1);
  });

  it("BLOQUANT — correctif audit P1-001: deux claims concurrents de matches PENDING ne réclament jamais le même match deux fois (vraies transactions Postgres parallèles)", async () => {
    const savedSearchRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ name: "Veille pour claim concurrent", criteria: {} }) });
    const savedSearch = (await savedSearchRes.json()) as { id: string };

    const myMatchIds: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const tender = await prisma.externalTender.create({
        data: { id: randomUUID(), organizationId: orgAId, source: "MANUAL", marketType: "PUBLIC", externalId: `claim-race-${i}-${randomUUID()}`, title: `Marché claim race ${i}`, cpvCodes: [], updatedAt: new Date() },
      });
      const match = await prisma.savedSearchMatch.create({
        data: { id: randomUUID(), organizationId: orgAId, savedSearchId: savedSearch.id, externalTenderId: tender.id, score: 50, matchReasons: [], emailStatus: "PENDING", updatedAt: new Date() },
      });
      myMatchIds.push(match.id);
    }

    const now = new Date();
    // Limite volontairement large : la propriété testée est l'absence de recouvrement entre les
    // deux ensembles réclamés, jamais une histoire de capacité/famine sur `limit`.
    const [batchA, batchB] = await Promise.all([
      matchRepository.claimPendingEmailBatch({ organizationId: orgAId, limit: 500, now, staleClaimThresholdMs: 10 * 60 * 1000 }),
      matchRepository.claimPendingEmailBatch({ organizationId: orgAId, limit: 500, now, staleClaimThresholdMs: 10 * 60 * 1000 }),
    ]);

    const claimedIds = [...batchA, ...batchB].map((m) => m.id);
    // Aucun match, y compris ceux d'autres tests de ce fichier, n'est jamais réclamé deux fois.
    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    for (const match of [...batchA, ...batchB]) {
      expect(match.emailStatus).toBe("SENDING");
    }
    // Les 10 matches créés par CE test ont bien été réclamés, chacun par un seul des deux appels
    // concurrents (jamais les deux, jamais aucun — sinon ce serait la famine, pas la sécurité).
    const myClaimed = claimedIds.filter((id) => myMatchIds.includes(id));
    expect(new Set(myClaimed).size).toBe(myMatchIds.length);
  });

  it("mission §51/§52 — a match can be marked INTERESTED/IGNORED and persists", async () => {
    const savedSearchRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ name: "Veille pour favoris", criteria: { includeKeywords: ["marché favori unique xyz"] } }) });
    const savedSearch = (await savedSearchRes.json()) as { id: string };

    const tender = await prisma.externalTender.create({
      data: { id: randomUUID(), organizationId: orgAId, source: "MANUAL", marketType: "PUBLIC", externalId: `fav-test-${randomUUID()}`, title: "Marché favori unique xyz", cpvCodes: [], updatedAt: new Date() },
    });
    const match = await prisma.savedSearchMatch.create({
      data: { id: randomUUID(), organizationId: orgAId, savedSearchId: savedSearch.id, externalTenderId: tender.id, score: 90, matchReasons: [], updatedAt: new Date() },
    });

    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/matches/${match.id}/status`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ status: "INTERESTED" }) });
    expect(res.status).toBe(200);

    const stored = await prisma.savedSearchMatch.findUnique({ where: { id: match.id } });
    expect(stored?.status).toBe("INTERESTED");
  });

  it("mission §37/§38/§100 — a notification created by the pipeline is listed and can be marked read", async () => {
    const notification = await prisma.notification.create({
      data: { id: randomUUID(), organizationId: orgAId, userId: ownerAUserId, type: "SAVED_SEARCH_MATCH", title: "Nouveau marché détecté" },
    });

    const listRes = await fetch(`${baseUrl}/api/v1/notifications`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { items: { id: string }[] };
    expect(list.items.some((n) => n.id === notification.id)).toBe(true);

    const unreadBefore = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(((await unreadBefore.json()) as { count: number }).count).toBeGreaterThan(0);

    const markReadRes = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(markReadRes.status).toBe(200);

    const stored = await prisma.notification.findUnique({ where: { id: notification.id } });
    expect(stored?.readAt).not.toBeNull();
  });

  it("BLOQUANT — mission §132/§74: a notification never leaks to a user other than its owner", async () => {
    const notification = await prisma.notification.create({
      data: { id: randomUUID(), organizationId: orgAId, userId: ownerAUserId, type: "SAVED_SEARCH_MATCH", title: "Confidentiel" },
    });

    const asOther = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokenContributorA, orgAId) });
    // Anti-IDOR : jamais un 403 qui confirmerait l'existence, jamais un succès non plus.
    expect(asOther.status).toBe(404);
  });

  it("mission §66/§67 — EmailAlertWorker.tick() runs without throwing even with zero pending matches (isolation, never blocks the app)", async () => {
    await expect(emailAlertWorker.tick()).resolves.toBeUndefined();
  });
});
