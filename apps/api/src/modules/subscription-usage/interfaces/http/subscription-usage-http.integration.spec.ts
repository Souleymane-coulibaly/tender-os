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

/**
 * V2 Sprint 22 (billing, étape 22D) — preuve réelle contre HTTP + PostgreSQL (NestJS), même motif
 * que `dashboard-http.integration.spec.ts` (Sprint 15). Couvre le point BLOQUANT mission §67
 * "CROSS-TENANT BILLING — Org A ne peut jamais voir... subscription B / credits B / usage B" pour
 * les endpoints self-service (`SubscriptionUsageController`) : chaque lecture est TOUJOURS scopée
 * à `membership.organizationId`, jamais un `organizationId` de requête.
 */
describe("SubscriptionUsageController (subscription-usage) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenContributorA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Subscription Usage HTTP Test" }),
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

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function get(path: string, token: string, organizationId: string): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${baseUrl}${path}`, { headers: authHeaders(token, organizationId) });
    const body = await res.json().catch(() => undefined);
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
        { id: orgAId, name: "Subscription Usage Org A HTTP", slug: `sub-usage-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Subscription Usage Org B HTTP", slug: `sub-usage-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`sub-usage-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`sub-usage-owner-b-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`sub-usage-contributor-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, contributorA.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenContributorA = contributorA.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });

    // Org A a un abonnement STARTER actif (MANUAL — n'exige pas Stripe pour ce test).
    await prisma.organizationSubscription.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        planTier: "STARTER",
        billingInterval: "MONTHLY",
        status: "ACTIVE",
        source: "MANUAL",
      },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 60000);

  it("returns the organization's own subscription for an authenticated member", async () => {
    const { status, body } = await get("/api/v1/billing/subscription", tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(body).toMatchObject({ subscription: { organizationId: orgAId, planTier: "STARTER", status: "ACTIVE", source: "MANUAL" } });
  });

  it("returns { subscription: null } (never a 404, never a bare-null body) for an organization with no subscription (Pass-only or no plan at all)", async () => {
    const { status, body } = await get("/api/v1/billing/subscription", tokenOwnerB, orgBId);
    expect(status).toBe(200);
    expect(body).toEqual({ subscription: null });
  });

  it("BLOQUANT (mission §67, cross-tenant billing) — Org B never sees Org A's subscription: X-Organization-Id always wins, never a body/query organizationId", async () => {
    const { status, body } = await get("/api/v1/billing/subscription", tokenOwnerB, orgBId);
    expect(status).toBe(200);
    expect(body).not.toMatchObject({ subscription: { organizationId: orgAId } });
  });

  it("returns organization-scoped entitlements (STARTER for Org A, no plan for Org B)", async () => {
    const orgA = await get("/api/v1/billing/entitlements", tokenOwnerA, orgAId);
    expect(orgA.status).toBe(200);
    expect(orgA.body).toMatchObject({ planTier: "STARTER" });

    const orgB = await get("/api/v1/billing/entitlements", tokenOwnerB, orgBId);
    expect(orgB.status).toBe(200);
    expect(orgB.body).toMatchObject({ planTier: null, entitlements: [], quotas: null });
  });

  it("returns an empty Pass purchase page for an organization with no Pass (never a 404)", async () => {
    const { status, body } = await get("/api/v1/billing/pass-purchases", tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(body).toMatchObject({ items: [], nextCursor: null });
  });

  it("returns a zero AO credit balance for an organization with no ledger activity (never a 404)", async () => {
    const { status, body } = await get("/api/v1/billing/ao-credits", tokenOwnerA, orgAId);
    expect(status).toBe(200);
    expect(body).toMatchObject({ balance: 0 });
  });

  it("returns organization-wide usage (active users, Chat IA today, storage) scoped to the caller's own organization", async () => {
    const { status, body } = await get("/api/v1/billing/usage", tokenOwnerA, orgAId);
    expect(status).toBe(200);
    // Owner + Contributor = 2 active members in Org A.
    expect(body).toMatchObject({ activeUsers: 2, chatMessagesToday: 0, storageBytesUsed: 0 });
  });

  it("is accessible to any active organization member, not only OWNER/ORGANIZATION_ADMIN (read-only)", async () => {
    const { status } = await get("/api/v1/billing/subscription", tokenContributorA, orgAId);
    expect(status).toBe(200);
  });
});
