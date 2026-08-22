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
 * Checkpoint TENDEROS-2.1-P2.3-E1, mission §15/§22 (TEST 11/13/16) — preuve RÉELLE HTTP + PostgreSQL
 * + graphe de modules complet (`AppModule`) : le pont `MembershipSeatLimitBridgeModule` résout
 * effectivement au bootstrap (jamais seulement un mock/spec isolé), et le backend refuse une
 * invitation dépassant `USERS_MAX`, jamais seulement le frontend (mission §15 explicite).
 */
describe("POST /organization-memberships — seat limit (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Seat Limit Test", termsAccepted: true }),
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

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-organization-id": organizationId };
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
        { id: orgAId, name: "Seat Limit Org A", slug: `seat-limit-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Seat Limit Org B", slug: `seat-limit-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`seat-owner-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId);
    tokenOwnerA = ownerA.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    // Starter ACTIVE, semé directement (mission §19 "E1 n'est pas une refonte Stripe complète") —
    // USERS_MAX(STARTER) = 2 (plan-catalog.ts), jamais recalculé ici.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgAId, planTier: "STARTER", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // TEST HYGIENE — outbox (MembershipCreated) et audit_log ont leur propre FK stricte vers
    // organization_id (même précédent que les autres suites HTTP réelles de ce dépôt).
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("TEST 13 — the OWNER (authorized role) can reach member management: invites a second member successfully (1 owner + 1 = 2, exactly at USERS_MAX)", async () => {
    const userB = await registerAndLogin(`seat-user-b-${randomUUID()}@smoke.test`);
    userIds.push(userB.userId);

    const res = await fetch(`${baseUrl}/api/v1/organization-memberships`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: userB.userId, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(201);
  });

  it("TEST 11/mission §15 — a 3rd invitation is refused by the backend itself (402 SEAT_LIMIT_EXCEEDED), never only a frontend restriction", async () => {
    const userC = await registerAndLogin(`seat-user-c-${randomUUID()}@smoke.test`);
    userIds.push(userC.userId);

    const res = await fetch(`${baseUrl}/api/v1/organization-memberships`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ userId: userC.userId, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SEAT_LIMIT_EXCEEDED");

    // Négatif explicite — jamais une membership fantôme créée avant l'échec.
    const listRes = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const list = (await listRes.json()) as { items: { userId: string }[] };
    expect(list.items.some((m) => m.userId === userC.userId)).toBe(false);
  });

  it("TEST 16 — seat limits are tenant-isolated: org B (no subscription, USERS_MAX resolves to 0 -> effectively no plan) never sees org A's member count or limit", async () => {
    const ownerB = await registerAndLogin(`seat-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    // Org B n'a AUCUN abonnement (jamais fabriqué) — `getEffectivePlanTier` résout `null`,
    // `getEffectiveLimit` retombe sur 0 (mission §22 "isolation tenant des entitlements/credits").
    const userD = await registerAndLogin(`seat-user-d-${randomUUID()}@smoke.test`);
    userIds.push(userD.userId);
    const res = await fetch(`${baseUrl}/api/v1/organization-memberships`, {
      method: "POST",
      headers: authHeaders(ownerB.token, orgBId),
      body: JSON.stringify({ userId: userD.userId, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SEAT_LIMIT_EXCEEDED");
  });
});
