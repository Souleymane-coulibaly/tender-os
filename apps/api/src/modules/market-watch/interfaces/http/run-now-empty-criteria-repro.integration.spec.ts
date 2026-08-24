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
import { MarketSourceSyncWorker } from "../../infrastructure/market-source-sync.worker";
import { SyncOrganizationMarketSourcesUseCase } from "../../application/use-cases/sync-organization-market-sources.use-case";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../../application/ports/external-tender.repository";

/**
 * REPRODUCTION runtime — "Tester la veille" retourne 0 alors que la veille n'a AUCUN critère
 * (donc aucun filtre : tout avis collecté doit matcher). Exerce le VRAI chemin de bout en bout
 * contre la VRAIE API BOAMP (réseau sortant réel, même motif que le test BOAMP live existant) :
 * organisation neuve -> veille sans critère -> POST /run-now -> collecte réelle -> matching ->
 * matches lisibles via l'API. Si ce test passe en local, le comportement observé en production
 * n'est pas dans cette chaîne de code.
 */
describe("Market Watch — run-now with EMPTY criteria (reproduction)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let token: string;

  function authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
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
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);

    await prisma.organization.create({
      data: { id: orgId, name: "Run-now repro org", slug: `run-now-repro-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email: `run-now-repro-${randomUUID()}@smoke.test`, displayName: "Run-now repro", status: "ACTIVE", passwordHash: "x" } });
    userIds.push(userId);
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 3600_000) } });
    token = accessTokenService.issue({ userId, sessionId }, 3600);
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
  }, 60000);

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { organizationId: orgId } });
    await prisma.savedSearchMatch.deleteMany({ where: { organizationId: orgId } });
    await prisma.savedSearch.deleteMany({ where: { organizationId: orgId } });
    await prisma.externalTender.deleteMany({ where: { organizationId: orgId } });
    await prisma.marketSourceSyncLease.deleteMany({ where: { organizationId: orgId } });
    await prisma.marketSourceSyncRun.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it(
    "BLOQUANT (repro exacte du terrain) — tenders ingested FIRST, watch created AFTER: the backfill must match the pre-existing backlog",
    async () => {
      process.env.MARKET_SOURCE_SYNC_BATCH_SIZE = "20";
      try {
        // Phase 1 — collecte SANS aucune veille : les avis existent avant la veille (situation
        // réelle de l'utilisateur : `unchanged=100`, donc aucun delta au moment du run-now).
        const worker = app.get(MarketSourceSyncWorker);
        await worker.tick();
        // Le worker ne balaie que les organisations AYANT une veille active : ici il n'y en a pas
        // encore, donc on déclenche explicitement la collecte pour CETTE organisation.
        const orgSync = app.get(SyncOrganizationMarketSourcesUseCase);
        await orgSync.execute({ organizationId: orgId });

        const tendersAfterIngestion = await prisma.externalTender.count({ where: { organizationId: orgId } });
        const withPublicationDate = await prisma.externalTender.count({ where: { organizationId: orgId, publicationDate: { not: null } } });
         
        console.log("[REPRO-2] tenders ingested =", tendersAfterIngestion, "| with publicationDate =", withPublicationDate);
        expect(tendersAfterIngestion).toBeGreaterThan(0);

        // Phase 2 — la veille est créée APRÈS, sans aucun critère : le backfill de création doit
        // matcher tout le backlog.
        const createRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name: "Backfill sur backlog", alertInApp: true }),
        });
        expect(createRes.status).toBe(201);
        const watch = (await createRes.json()) as { id: string };

        const matchesAfterCreate = await prisma.savedSearchMatch.count({ where: { organizationId: orgId, savedSearchId: watch.id } });
         
        console.log("[REPRO-2] matches after watch creation (backfill) =", matchesAfterCreate);

        // --- Instrumentation : reproduire EXACTEMENT ce que fait le backfill, étape par étape ---
        // BLOQUANT (correctif P0) — les avis ingérés doivent être RÉCENTS. Avant le correctif, le
        // connecteur envoyait `sort=-dateparution`, que l'API BOAMP interprète à l'envers : il
        // ingérait les avis de 2015, hors de la fenêtre de backfill (30 jours), rendant TOUTE veille
        // structurellement incapable de matcher.
        const staleTenders = await prisma.externalTender.count({
          where: { organizationId: orgId, publicationDate: { lt: new Date(Date.now() - 365 * 24 * 3600 * 1000) } },
        });
        expect(staleTenders).toBe(0);

        const tenderRepo = app.get<ExternalTenderRepository>(EXTERNAL_TENDER_REPOSITORY);
        const listed = await tenderRepo.list({ organizationId: orgId, publishedAfter: new Date(Date.now() - 30 * 24 * 3600 * 1000), limit: 200 });
        // Le backfill doit avoir de VRAIS candidats dans sa fenêtre.
        expect(listed.items.length).toBeGreaterThan(0);

        // Phase 3 — run-now : étape 1 sans delta (unchanged), donc SEUL le backfill peut matcher.
        const runRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${watch.id}/run-now`, { method: "POST", headers: authHeaders() });
        const runBody = (await runRes.json()) as { matchesFound: number };
        const matchesAfterRun = await prisma.savedSearchMatch.count({ where: { organizationId: orgId, savedSearchId: watch.id } });
         
        console.log("[REPRO-2] run-now =", runBody, "| matches in DB after run-now =", matchesAfterRun);

        expect(matchesAfterRun).toBeGreaterThan(0);
      } finally {
        delete process.env.MARKET_SOURCE_SYNC_BATCH_SIZE;
      }
    },
    180000,
  );

  it(
    "BLOQUANT — a brand-new watch with NO criteria at all, on a brand-new org, finds real BOAMP opportunities via run-now",
    async () => {
      process.env.MARKET_SOURCE_SYNC_BATCH_SIZE = "20";
      try {
        const createRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ name: "Diagnostic tout", alertInApp: true }),
        });
        expect(createRes.status).toBe(201);
        const savedSearch = (await createRes.json()) as { id: string };

        const runRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders() });
        expect(runRes.status).toBe(200);
        const runBody = (await runRes.json()) as { matchesFound: number };

        const tenders = await prisma.externalTender.count({ where: { organizationId: orgId } });
        const matches = await prisma.savedSearchMatch.count({ where: { organizationId: orgId, savedSearchId: savedSearch.id } });
        const runs = await prisma.marketSourceSyncRun.findMany({ where: { organizationId: orgId }, select: { source: true, status: true, opportunitiesFetched: true, opportunitiesCreated: true, matchesCreated: true, errorSummary: true } });
         
        console.log("[REPRO] runBody=", runBody, "tendersInDb=", tenders, "matchesInDb=", matches, "syncRuns=", JSON.stringify(runs));

        const listRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/matches`, { headers: authHeaders() });
        const listBody = (await listRes.json()) as { items: unknown[] };
         
        console.log("[REPRO] matches returned by the API =", listBody.items.length);

        expect(tenders).toBeGreaterThan(0);
        expect(matches).toBeGreaterThan(0);
        expect(listBody.items.length).toBeGreaterThan(0);
      } finally {
        delete process.env.MARKET_SOURCE_SYNC_BATCH_SIZE;
      }
    },
    120000,
  );
});
