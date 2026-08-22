import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { PrismaMembershipRepository } from "../../infrastructure/prisma-membership.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 3, mission TEST 12 — fichier SÉPARÉ de
 * `organization-memberships-seat-limit-http.integration.spec.ts` (jamais fusionné) : chaque spec
 * d'intégration démarre sa PROPRE instance `AppModule` (donc son propre `AuthThrottlerGuard` en
 * mémoire, scopé au process de CE fichier) — regrouper ce test dans le fichier existant l'aurait
 * fait dépasser le seuil "5+ `registerAndLogin()` par fichier" déjà connu pour déclencher un vrai
 * 429 (bucket "auth" partagé register+login, 10 req/60s), provoquant des échecs de tests SANS
 * rapport avec une régression réelle (leçon retenue de sessions précédentes).
 */
describe("POST /organization-memberships — seat limit REAL CONCURRENCY (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let ownerToken: string;

  const orgId = randomUUID();
  const userIds: string[] = [];

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Seat Limit Concurrency Test", termsAccepted: true }),
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

  function authHeaders(token: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-organization-id": orgId };
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

    await prisma.organization.create({ data: { id: orgId, name: "Seat Limit Concurrency Org", slug: `seat-limit-concurrency-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`seat-conc-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgId, planTier: "STARTER", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });

    ownerToken = owner.token;
  }, 60000);

  afterAll(async () => {
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.delete({ where: { id: orgId } });
    await app.close();
  });

  it("mission TEST 12 — with exactly 1 seat remaining (STARTER, limit=2, 1 active), firing 2 truly concurrent invitations yields exactly 1 success (201) and 1 SEAT_LIMIT_EXCEEDED (402), final active count exactly at the limit", async () => {
    const userE = await registerAndLogin(`seat-conc-user-e-${randomUUID()}@smoke.test`);
    const userF = await registerAndLogin(`seat-conc-user-f-${randomUUID()}@smoke.test`);
    userIds.push(userE.userId, userF.userId);

    const [resE, resF] = await Promise.all([
      fetch(`${baseUrl}/api/v1/organization-memberships`, { method: "POST", headers: authHeaders(ownerToken), body: JSON.stringify({ userId: userE.userId, role: "CONTRIBUTOR" }) }),
      fetch(`${baseUrl}/api/v1/organization-memberships`, { method: "POST", headers: authHeaders(ownerToken), body: JSON.stringify({ userId: userF.userId, role: "CONTRIBUTOR" }) }),
    ]);

    const statuses = [resE.status, resF.status].sort();
    expect(statuses).toEqual([201, 402]);

    const listRes = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(ownerToken) });
    const list = (await listRes.json()) as { items: { status: string }[] };
    expect(list.items.filter((m) => m.status === "ACTIVE")).toHaveLength(2);
  });
});
