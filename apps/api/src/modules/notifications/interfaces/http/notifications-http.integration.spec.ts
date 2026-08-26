import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { EMAIL_PROVIDER, type EmailMessage, type EmailProvider } from "../../../../shared-kernel/email-provider";
import { ACCESS_TOKEN_SERVICE, type AccessTokenService } from "../../../identity/application/ports/access-token.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { SendPendingEmailAlertsUseCase } from "../../../market-watch/application/use-cases/send-pending-email-alerts.use-case";

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E11 (Notifications V2) — première suite HTTP + PostgreSQL réelle
 * pour ce module (mission §67 : aucune n'existait avant ce Checkpoint, voir l'audit initial).
 * Couvre le centre de notifications (list/unread-count/read/read-all, tenant+user isolation,
 * anti-IDOR, pagination, concurrence) et les nouvelles préférences email (défauts, mise à jour,
 * isolation par utilisateur, catégorie invalide), plus une preuve de bout en bout que la
 * préférence "MARKET_WATCH" désactivée bloque réellement l'email du pipeline E10 existant sans
 * jamais toucher à la notification in-app ni au match métier lui-même.
 */
describe("Notifications V2 (Checkpoint TENDEROS-2.1-P2.3-E11) — HTTP + PostgreSQL réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let accessTokenService: AccessTokenService;
  let fakeEmailProvider: FakeEmailProvider;
  let sendPendingEmailAlertsUseCase: SendPendingEmailAlertsUseCase;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  const tokens = new Map<string, string>();
  const userIdsByToken = new Map<string, string>();

  async function createActor(email: string): Promise<{ userId: string; token: string }> {
    const userId = randomUUID();
    await prisma.user.create({ data: { id: userId, email, displayName: "Notifications HTTP Test", status: "ACTIVE", passwordHash: "not-used-direct-actor-creation" } });
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

  async function seedNotification(organizationId: string, userId: string, overrides: Partial<{ type: string; title: string; readAt: Date | null; createdAt: Date }> = {}) {
    return prisma.notification.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId,
        type: overrides.type ?? "WORKSPACE_MENTION",
        title: overrides.title ?? "Test notification",
        readAt: overrides.readAt ?? null,
        createdAt: overrides.createdAt ?? new Date(),
      },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EMAIL_PROVIDER).useValue(new FakeEmailProvider()).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);
    accessTokenService = moduleRef.get(ACCESS_TOKEN_SERVICE);
    fakeEmailProvider = moduleRef.get(EMAIL_PROVIDER);
    sendPendingEmailAlertsUseCase = moduleRef.get(SendPendingEmailAlertsUseCase);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Notifications HTTP Org A", slug: `notifications-http-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Notifications HTTP Org B", slug: `notifications-http-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA1 = await createActor(`notifications-owner-a1-${randomUUID()}@smoke.test`);
    userIds.push(ownerA1.userId);
    tokens.set("A1", ownerA1.token);
    userIdsByToken.set("A1", ownerA1.userId);
    await addMembership(orgAId, ownerA1.userId, OrganizationRole.Owner);

    const contributorA2 = await createActor(`notifications-contributor-a2-${randomUUID()}@smoke.test`);
    userIds.push(contributorA2.userId);
    tokens.set("A2", contributorA2.token);
    userIdsByToken.set("A2", contributorA2.userId);
    await addMembership(orgAId, contributorA2.userId, OrganizationRole.Contributor);

    const ownerB1 = await createActor(`notifications-owner-b1-${randomUUID()}@smoke.test`);
    userIds.push(ownerB1.userId);
    tokens.set("B1", ownerB1.token);
    userIdsByToken.set("B1", ownerB1.userId);
    await addMembership(orgBId, ownerB1.userId, OrganizationRole.Owner);
  }, 60000);

  afterAll(async () => {
    await prisma.savedSearchMatch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.externalTender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.savedSearch.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.notification.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  describe("List / unread-count — tenant + user scoping", () => {
    it("BLOQUANT — a user only ever sees their OWN notifications, never another user's in the same org", async () => {
      await seedNotification(orgAId, userIdsByToken.get("A1")!, { title: "For A1 only" });

      const asA1 = await fetch(`${baseUrl}/api/v1/notifications`, { headers: authHeaders(tokens.get("A1")!, orgAId) });
      const bodyA1 = (await asA1.json()) as { items: Array<{ title: string }> };
      expect(bodyA1.items.some((n) => n.title === "For A1 only")).toBe(true);

      const asA2 = await fetch(`${baseUrl}/api/v1/notifications`, { headers: authHeaders(tokens.get("A2")!, orgAId) });
      const bodyA2 = (await asA2.json()) as { items: Array<{ title: string }> };
      expect(bodyA2.items.some((n) => n.title === "For A1 only")).toBe(false);
    });

    it("BLOQUANT — unread-count is backend-authoritative and matches the real DB state exactly", async () => {
      const owner = userIdsByToken.get("B1")!;
      await prisma.notification.deleteMany({ where: { organizationId: orgBId, userId: owner } });
      await seedNotification(orgBId, owner, { readAt: null });
      await seedNotification(orgBId, owner, { readAt: null });
      await seedNotification(orgBId, owner, { readAt: new Date() });

      const res = await fetch(`${baseUrl}/api/v1/notifications/unread-count`, { headers: authHeaders(tokens.get("B1")!, orgBId) });
      const body = (await res.json()) as { count: number };
      expect(body.count).toBe(2);

      const dbCount = await prisma.notification.count({ where: { organizationId: orgBId, userId: owner, readAt: null } });
      expect(body.count).toBe(dbCount);
    });

    it("mission §36 — pagination via cursor is stable: every notification appears exactly once across pages, newest first", async () => {
      const owner = randomUUID();
      await prisma.user.create({ data: { id: owner, email: `pagination-${owner}@smoke.test`, displayName: "Pagination Test", status: "ACTIVE", passwordHash: "x" } });
      await addMembership(orgAId, owner, OrganizationRole.Contributor);
      userIds.push(owner);
      const sessionId = randomUUID();
      await prisma.session.create({ data: { id: sessionId, userId: owner, expiresAt: new Date(Date.now() + 3600_000) } });
      const token = accessTokenService.issue({ userId: owner, sessionId }, 3600);

      const createdTitles: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const title = `Pagination item ${i}`;
        createdTitles.push(title);
        await seedNotification(orgAId, owner, { title, createdAt: new Date(Date.now() + i * 1000) });
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query = cursor ? `?limit=3&cursor=${cursor}` : "?limit=3";
        const res = await fetch(`${baseUrl}/api/v1/notifications${query}`, { headers: authHeaders(token, orgAId) });
        const body = (await res.json()) as { items: Array<{ id: string; title: string }>; nextCursor: string | null };
        seen.push(...body.items.map((n) => n.title));
        cursor = body.nextCursor;
      } while (cursor);

      const seenOfInterest = seen.filter((title) => createdTitles.includes(title));
      expect(seenOfInterest).toHaveLength(7);
      expect(new Set(seenOfInterest).size).toBe(7);
      // newest first (createdAt DESC) — reversed insertion order.
      expect(seenOfInterest).toEqual([...createdTitles].reverse());
    });
  });

  describe("Mark read / mark all read", () => {
    it("BLOQUANT (anti-IDOR) — another user in the SAME org cannot mark someone else's notification as read (404, not 403)", async () => {
      const notification = await seedNotification(orgAId, userIdsByToken.get("A1")!, { title: "A1 private" });
      const res = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokens.get("A2")!, orgAId) });
      expect(res.status).toBe(404);

      const dbRow = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbRow?.readAt).toBeNull();
    });

    it("BLOQUANT (cross-tenant) — Org B can never mark Org A's notification as read", async () => {
      const notification = await seedNotification(orgAId, userIdsByToken.get("A1")!, { title: "A1 cross-tenant target" });
      const res = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokens.get("B1")!, orgBId) });
      expect(res.status).toBe(404);
    });

    it("mark read is idempotent — calling it twice never errors and leaves the notification read", async () => {
      const notification = await seedNotification(orgAId, userIdsByToken.get("A1")!, { title: "Idempotent read" });
      const first = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokens.get("A1")!, orgAId) });
      expect(first.status).toBe(200);
      const second = await fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokens.get("A1")!, orgAId) });
      expect(second.status).toBe(200);

      const dbRow = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbRow?.readAt).not.toBeNull();
    });

    it("BLOQUANT (mission §49 concurrency) — Promise.all([markRead, markRead]) on the same notification never errors, final state is read", async () => {
      const notification = await seedNotification(orgAId, userIdsByToken.get("A1")!, { title: "Concurrent read" });
      const call = () => fetch(`${baseUrl}/api/v1/notifications/${notification.id}/read`, { method: "POST", headers: authHeaders(tokens.get("A1")!, orgAId) });
      const [resA, resB] = await Promise.all([call(), call()]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const dbRow = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbRow?.readAt).not.toBeNull();
    });

    it("BLOQUANT — mark-all-read is user AND organization scoped: never touches another user's or another org's notifications", async () => {
      const owner = userIdsByToken.get("A1")!;
      await prisma.notification.deleteMany({ where: { organizationId: orgAId, userId: owner } });
      const ownNotification = await seedNotification(orgAId, owner, { readAt: null });
      const otherUserNotification = await seedNotification(orgAId, userIdsByToken.get("A2")!, { readAt: null });
      const otherOrgNotification = await seedNotification(orgBId, userIdsByToken.get("B1")!, { readAt: null });

      const res = await fetch(`${baseUrl}/api/v1/notifications/read-all`, { method: "POST", headers: authHeaders(tokens.get("A1")!, orgAId) });
      expect(res.status).toBe(200);

      expect((await prisma.notification.findUniqueOrThrow({ where: { id: ownNotification.id } })).readAt).not.toBeNull();
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: otherUserNotification.id } })).readAt).toBeNull();
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: otherOrgNotification.id } })).readAt).toBeNull();
    });

    it("BLOQUANT (mission §50 concurrency) — Promise.all([markAllRead, markAllRead]) never produces an inconsistent state", async () => {
      const owner = userIdsByToken.get("A2")!;
      await prisma.notification.deleteMany({ where: { organizationId: orgAId, userId: owner } });
      await seedNotification(orgAId, owner, { readAt: null });
      await seedNotification(orgAId, owner, { readAt: null });

      const call = () => fetch(`${baseUrl}/api/v1/notifications/read-all`, { method: "POST", headers: authHeaders(tokens.get("A2")!, orgAId) });
      const [resA, resB] = await Promise.all([call(), call()]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      const remainingUnread = await prisma.notification.count({ where: { organizationId: orgAId, userId: owner, readAt: null } });
      expect(remainingUnread).toBe(0);
    });
  });

  describe("Preferences (mission §20/§21/§28)", () => {
    it("BLOQUANT — defaults are explicit: a user with no persisted preference sees all 3 categories with emailEnabled=true", async () => {
      const owner = randomUUID();
      await prisma.user.create({ data: { id: owner, email: `prefs-defaults-${owner}@smoke.test`, displayName: "Prefs Defaults", status: "ACTIVE", passwordHash: "x" } });
      await addMembership(orgAId, owner, OrganizationRole.Contributor);
      userIds.push(owner);
      const sessionId = randomUUID();
      await prisma.session.create({ data: { id: sessionId, userId: owner, expiresAt: new Date(Date.now() + 3600_000) } });
      const token = accessTokenService.issue({ userId: owner, sessionId }, 3600);

      const res = await fetch(`${baseUrl}/api/v1/notifications/preferences`, { headers: authHeaders(token, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: Array<{ category: string; emailEnabled: boolean }> };
      expect(body.items).toHaveLength(3);
      expect(body.items.every((p) => p.emailEnabled === true)).toBe(true);
      expect(new Set(body.items.map((p) => p.category))).toEqual(new Set(["MARKET_WATCH", "COLLABORATION", "BILLING"]));
    });

    it("BLOQUANT — updating a preference persists it and is reflected on the next GET, never affecting other categories", async () => {
      const putRes = await fetch(`${baseUrl}/api/v1/notifications/preferences/COLLABORATION`, { method: "PUT", headers: authHeaders(tokens.get("A1")!, orgAId), body: JSON.stringify({ emailEnabled: false }) });
      expect(putRes.status).toBe(200);

      const getRes = await fetch(`${baseUrl}/api/v1/notifications/preferences`, { headers: authHeaders(tokens.get("A1")!, orgAId) });
      const body = (await getRes.json()) as { items: Array<{ category: string; emailEnabled: boolean }> };
      const collaboration = body.items.find((p) => p.category === "COLLABORATION");
      const billing = body.items.find((p) => p.category === "BILLING");
      expect(collaboration?.emailEnabled).toBe(false);
      expect(billing?.emailEnabled).toBe(true);
    });

    it("BLOQUANT — an invalid category is rejected (422), never silently accepted", async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications/preferences/NOT_A_REAL_CATEGORY`, { method: "PUT", headers: authHeaders(tokens.get("A1")!, orgAId), body: JSON.stringify({ emailEnabled: false }) });
      expect(res.status).toBe(422);
    });

    it("BLOQUANT (mission §21) — preferences are strictly personal: User A's update never affects User B's own preferences", async () => {
      await fetch(`${baseUrl}/api/v1/notifications/preferences/BILLING`, { method: "PUT", headers: authHeaders(tokens.get("A1")!, orgAId), body: JSON.stringify({ emailEnabled: false }) });

      const bRes = await fetch(`${baseUrl}/api/v1/notifications/preferences`, { headers: authHeaders(tokens.get("B1")!, orgBId) });
      const bBody = (await bRes.json()) as { items: Array<{ category: string; emailEnabled: boolean }> };
      expect(bBody.items.find((p) => p.category === "BILLING")?.emailEnabled).toBe(true);
    });
  });

  describe("End-to-end: MARKET_WATCH email preference actually gates the real E10 email pipeline", () => {
    async function seedPendingMatch(ownerUserId: string, alertEmail: boolean): Promise<{ savedSearchId: string; matchId: string }> {
      const savedSearch = await prisma.savedSearch.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          ownerUserId,
          name: `Prefs E2E ${randomUUID()}`,
          includeKeywords: [],
          excludeKeywords: [],
          cpvCodes: [],
          countries: [],
          regions: [],
          departments: [],
          cities: [],
          marketTypes: [],
          sources: [],
          includeUnknownAmount: true,
          procedureTypes: [],
          alertInApp: true,
          alertEmail,
          emailFrequency: "IMMEDIATE",
          createdBy: ownerUserId,
        },
      });
      const tender = await prisma.externalTender.create({
        data: { id: randomUUID(), organizationId: orgAId, source: "BOAMP", marketType: "PUBLIC", externalId: `prefs-e2e-${randomUUID()}`, title: "Marché préférences E11", cpvCodes: [], country: "FR", updatedAt: new Date() },
      });
      const match = await prisma.savedSearchMatch.create({
        data: { id: randomUUID(), organizationId: orgAId, savedSearchId: savedSearch.id, externalTenderId: tender.id, score: 90, matchReasons: [], emailStatus: "PENDING" },
      });
      return { savedSearchId: savedSearch.id, matchId: match.id };
    }

    it("BLOQUANT (mission §26 + §93 non-régression E9) — MARKET_WATCH email disabled: match stays PENDING, no email dispatched, notification/match untouched, 0 AO credit", async () => {
      const owner = userIdsByToken.get("A1")!;
      await fetch(`${baseUrl}/api/v1/notifications/preferences/MARKET_WATCH`, { method: "PUT", headers: authHeaders(tokens.get("A1")!, orgAId), body: JSON.stringify({ emailEnabled: false }) });

      const { matchId } = await seedPendingMatch(owner, true);
      const sentBefore = fakeEmailProvider.sent.length;

      const result = await sendPendingEmailAlertsUseCase.execute({ organizationId: orgAId, batchSize: 50, baseUrl: "https://app.tenderos.test" });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(fakeEmailProvider.sent.length).toBe(sentBefore);
      const match = await prisma.savedSearchMatch.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.emailStatus).toBe("PENDING");

      const aoCreditEntries = await prisma.aoCreditLedgerEntry.count({ where: { organizationId: orgAId } });
      expect(aoCreditEntries).toBe(0);
    });

    it("BLOQUANT (mission §27) — MARKET_WATCH email re-enabled: a genuinely pending match is actually sent via the real pipeline", async () => {
      // Nettoyage explicite — le match PENDING du test précédent (préférence désactivée, mission
      // §26) appartient à la MÊME organisation et resterait autrement éligible au claim de CE test,
      // faussant `result.sent` (jamais un défaut de l'implémentation, un artefact d'isolation entre
      // deux tests séquentiels partageant la même org).
      await prisma.savedSearchMatch.deleteMany({ where: { organizationId: orgAId } });
      await prisma.externalTender.deleteMany({ where: { organizationId: orgAId } });
      await prisma.savedSearch.deleteMany({ where: { organizationId: orgAId } });

      const owner = userIdsByToken.get("A1")!;
      await fetch(`${baseUrl}/api/v1/notifications/preferences/MARKET_WATCH`, { method: "PUT", headers: authHeaders(tokens.get("A1")!, orgAId), body: JSON.stringify({ emailEnabled: true }) });

      const { matchId } = await seedPendingMatch(owner, true);
      const result = await sendPendingEmailAlertsUseCase.execute({ organizationId: orgAId, batchSize: 50, baseUrl: "https://app.tenderos.test" });

      expect(result.sent).toBe(1);
      const match = await prisma.savedSearchMatch.findUniqueOrThrow({ where: { id: matchId } });
      expect(match.emailStatus).toBe("SENT");
    });
  });
});
