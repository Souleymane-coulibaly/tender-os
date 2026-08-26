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

/**
 * Checkpoint TENDEROS-2.1-P2.3-E10 (Market Watch — Runtime Delivery & Notifications) — preuve HTTP
 * + PostgreSQL réelle des correctifs de ce checkpoint :
 *   1. P1 root cause — éditer/réactiver une veille ne réévaluait jamais son matching contre le
 *      backlog déjà connu (seule la CRÉATION le faisait) : `UpdateSavedSearchUseCase`/
 *      `SetSavedSearchStatusUseCase` déclenchent désormais le même backfill best-effort.
 *   2. "Tester la veille" (mission §13.B-§13.H) — `POST /market-watch/saved-searches/:id/run-now`,
 *      EXACT même use case que le scheduler (`SyncOrganizationMarketSourcesUseCase`) + le backfill
 *      déjà réel de la veille testée, jamais un second pipeline.
 * Réutilise le même style que `market-watch-http.integration.spec.ts` (seed direct
 * `prisma.externalTender.create`, jamais un mock de repository) — un `ExternalTender` seedé
 * directement en base est le backlog "déjà connu" que le backfill doit retrouver, déterministe et
 * indépendant du contenu changeant des vraies API BOAMP/TED que `run-now` interroge aussi (étape 1
 * du pipeline, mission §13.C.7) — les assertions ci-dessous portent uniquement sur CE marché seedé,
 * jamais sur ce que le réseau réel pourrait ou non renvoyer.
 */
describe("Market Watch — runtime delivery (Checkpoint TENDEROS-2.1-P2.3-E10) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  const tokens = new Map<string, string>();
  let ownerAUserId: string;

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Market Watch Runtime HTTP Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
    const sessionId = randomUUID();
    await prisma.session.create({ data: { id: sessionId, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    return { userId, token: accessTokenService.issue({ userId, sessionId }, 3600) };
  }

  async function addMembership(organizationId: string, userId: string, role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId, userId, role, occurredAt: new Date() }));
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createSavedSearch(token: string, orgId: string, body: Record<string, unknown>): Promise<{ id: string }> {
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches`, { method: "POST", headers: authHeaders(token, orgId), body: JSON.stringify(body) });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
  }

  async function seedExternalTender(orgId: string, overrides: Partial<{ title: string; includeKeywords: string }> = {}): Promise<{ id: string }> {
    return prisma.externalTender.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        source: "BOAMP",
        marketType: "PUBLIC",
        externalId: `runtime-delivery-${randomUUID()}`,
        title: overrides.title ?? "Marché de nettoyage industriel spécialisé",
        cpvCodes: [],
        country: "FR",
        // `backfillMatchesForSavedSearch` filtre `publicationDate >= now - 30j` (SQL `gte`, jamais
        // vrai pour NULL) — une date de publication récente est nécessaire pour que ce marché soit
        // un candidat éligible au backfill, jamais seulement au matching lui-même.
        publicationDate: new Date(),
        updatedAt: new Date(),
      },
    });
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Market Watch Runtime Org A", slug: `market-watch-runtime-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Market Watch Runtime Org B", slug: `market-watch-runtime-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await createActor(`market-watch-runtime-owner-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId);
    ownerAUserId = ownerA.userId;
    tokens.set("OWNER_A", ownerA.token);
    await addMembership(orgAId, ownerA.userId, OrganizationRole.Owner);

    const readOnlyA = await createActor(`market-watch-runtime-readonly-a-${randomUUID()}@smoke.test`);
    userIds.push(readOnlyA.userId);
    tokens.set("READ_ONLY_A", readOnlyA.token);
    await addMembership(orgAId, readOnlyA.userId, OrganizationRole.ReadOnly);

    const contributorA = await createActor(`market-watch-runtime-contributor-a-${randomUUID()}@smoke.test`);
    userIds.push(contributorA.userId);
    tokens.set("CONTRIBUTOR_A", contributorA.token);
    await addMembership(orgAId, contributorA.userId, OrganizationRole.Contributor);

    const ownerB = await createActor(`market-watch-runtime-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    tokens.set("OWNER_B", ownerB.token);
    await addMembership(orgBId, ownerB.userId, OrganizationRole.Owner);
  }, 60000);

  afterAll(async () => {
    // Checkpoint TENDEROS-2.1-P2.3-E12.4 (correctif post-FULL-RUN) — fermer l'application AVANT
    // la purge, jamais apres. Ce spec declenche un pipeline de veille ASYNCHRONE : tant que
    // l'app tourne, ses dispatchers ecrivent encore de vrais `OutboxEvent` pour ces
    // organisations, et `organization.deleteMany` violait alors
    // `outbox_events_organization_id_fkey` — echec observe au FULL RUN, invisible isolement.
    // `app.close()` attend desormais le travail en vol (`BackgroundTaskRunner`, E12.3).
    await app.close();
    await prisma.notification.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.savedSearchMatch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.savedSearch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.externalTender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.$disconnect();
  }, 60000);

  it("BLOQUANT (P1 root cause) — broadening criteria on an EXISTING saved search surfaces a pre-existing matching ExternalTender, without waiting for a future sync cycle", async () => {
    const tender = await seedExternalTender(orgAId, { title: "Reference tender for edit backfill" });
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Edit backfill test", criteria: { includeKeywords: ["mot-clef-improbable-jamais-present"] }, alertInApp: true });

    const beforeUpdate = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/matches`, { headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
    const beforeBody = (await beforeUpdate.json()) as { items: Array<{ externalTenderId: string }> };
    expect(beforeBody.items.some((m) => m.externalTenderId === tender.id)).toBe(false);

    const updateRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}`, {
      method: "PATCH",
      headers: authHeaders(tokens.get("OWNER_A")!, orgAId),
      body: JSON.stringify({ criteria: { includeKeywords: ["Reference tender for edit backfill"] } }),
    });
    expect(updateRes.status).toBe(200);

    const afterUpdate = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/matches`, { headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
    const afterBody = (await afterUpdate.json()) as { items: Array<{ externalTenderId: string }> };
    expect(afterBody.items.some((m) => m.externalTenderId === tender.id)).toBe(true);
  });

  it("BLOQUANT (P1 root cause) — reactivating a disabled saved search surfaces matches that appeared while it was paused", async () => {
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Reactivation backfill test", criteria: { includeKeywords: ["mot-clef-reactivation-unique"] }, alertInApp: true });

    const disableRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/status`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId), body: JSON.stringify({ enabled: false }) });
    expect(disableRes.status).toBe(200);

    // Un marché correspondant apparaît PENDANT que la veille est en pause.
    const tender = await seedExternalTender(orgAId, { title: "Marché apparu pendant la pause mot-clef-reactivation-unique" });

    const enableRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/status`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId), body: JSON.stringify({ enabled: true }) });
    expect(enableRes.status).toBe(200);

    const matchesRes = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/matches`, { headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
    const matchesBody = (await matchesRes.json()) as { items: Array<{ externalTenderId: string }> };
    expect(matchesBody.items.some((m) => m.externalTenderId === tender.id)).toBe(true);
  });

  it("BLOQUANT — mission §13.C RBAC: READ_ONLY cannot run-now (403)", async () => {
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "RBAC run-now test" });
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("READ_ONLY_A")!, orgAId) });
    expect(res.status).toBe(403);
  });

  it("BLOQUANT — mission §17 anti-IDOR: another user in the SAME organization cannot run-now someone else's saved search (404, not 403)", async () => {
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Ownership run-now test" });
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("CONTRIBUTOR_A")!, orgAId) });
    expect(res.status).toBe(404);
  });

  it("BLOQUANT — mission §57 cross-tenant: Org B can never run-now Org A's saved search", async () => {
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Cross-tenant run-now test" });
    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("OWNER_B")!, orgBId) });
    expect(res.status).toBe(404);
  });

  it("mission §75 — run-now on a DISABLED saved search is refused, never a way to bypass deactivation", async () => {
    const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Disabled run-now test" });
    await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/status`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId), body: JSON.stringify({ enabled: false }) });

    const res = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
    expect(res.status).toBe(404);
  });

  it(
    "BLOQUANT (mission §13.H idempotence + §93 non-régression E9) — a real run-now finds a seeded match exactly once, a second click finds 0 new, never a duplicate match/notification, and consumes ZERO AO credit",
    async () => {
      // Ordre volontaire — la veille est créée AVANT que le marché n'existe (jamais l'inverse) : le
      // backfill de `CreateSavedSearchUseCase` (déjà existant, jamais modifié par ce Checkpoint) ne
      // trouverait alors rien, isolant précisément l'idempotence de `run-now` lui-même (jamais un
      // faux positif dû au backfill de création).
      const uniqueKeyword = `mot-clef-idempotence-${randomUUID()}`;
      const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Idempotence run-now test", criteria: { includeKeywords: [uniqueKeyword] }, alertInApp: true });
      const tender = await seedExternalTender(orgAId, { title: `Marché ${uniqueKeyword}` });

      const first = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { matchesFound: number };
      expect(firstBody.matchesFound).toBeGreaterThanOrEqual(1);

      const second = await fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
      expect(second.status).toBe(200);
      const secondBody = (await second.json()) as { matchesFound: number };
      expect(secondBody.matchesFound).toBe(0);

      const matchRows = await prisma.savedSearchMatch.findMany({ where: { organizationId: orgAId, savedSearchId: savedSearch.id, externalTenderId: tender.id } });
      expect(matchRows).toHaveLength(1);

      const notificationRows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: ownerAUserId, metadata: { path: ["externalTenderId"], equals: tender.id } } });
      expect(notificationRows).toHaveLength(1);

      // Mission §93 non-régression E9 — une opportunité détectée par la Veille ne consomme JAMAIS de
      // crédit AO (découverte ≠ processus AO consommé).
      const aoCreditEntries = await prisma.aoCreditLedgerEntry.count({ where: { organizationId: orgAId } });
      expect(aoCreditEntries).toBe(0);
    },
    // Checkpoint TENDEROS-2.1-PRE-DECOM-FIX (REC-002) — budget porte de 30 s a 120 s, sur MESURE.
    // Avant le correctif, la source TED plantait immediatement (titre trop long pour
    // `notifications.title`) : le cycle avortait en quelques secondes. TED traite desormais
    // reellement ses avis — un `run-now` seul a ete mesure a 25 s contre les sources vives, et ce
    // test en enchaine DEUX. L'operation est donc intrinsequement plus longue PARCE QU'ELLE
    // ABOUTIT : ce n'est pas un contournement de lenteur, c'est le cout du travail reellement
    // effectue. Aucun autre budget n'est modifie.
    120000,
  );

  it(
    "BLOQUANT (mission §92 concurrence) — Promise.all([run-now, run-now]) on the SAME saved search never creates a duplicate match or notification",
    async () => {
      const uniqueKeyword = `mot-clef-concurrence-${randomUUID()}`;
      await seedExternalTender(orgAId, { title: `Marché ${uniqueKeyword}` });
      const savedSearch = await createSavedSearch(tokens.get("OWNER_A")!, orgAId, { name: "Concurrency run-now test", criteria: { includeKeywords: [uniqueKeyword] }, alertInApp: true });

      const runNow = () => fetch(`${baseUrl}/api/v1/market-watch/saved-searches/${savedSearch.id}/run-now`, { method: "POST", headers: authHeaders(tokens.get("OWNER_A")!, orgAId) });
      const [resA, resB] = await Promise.all([runNow(), runNow()]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const matchRows = await prisma.savedSearchMatch.findMany({ where: { organizationId: orgAId, savedSearchId: savedSearch.id } });
      expect(matchRows).toHaveLength(1);

      const notificationRows = await prisma.notification.findMany({ where: { organizationId: orgAId, userId: ownerAUserId, metadata: { path: ["savedSearchId"], equals: savedSearch.id } } });
      expect(notificationRows).toHaveLength(1);
    },
    30000,
  );
});
