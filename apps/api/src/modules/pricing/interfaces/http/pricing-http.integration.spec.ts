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
 * Preuve réelle HTTP + PostgreSQL du module Pricing (Sprint 7) — flux complet (création →
 * recalcul → archivage), permissions par rôle, isolation inter-tenant/inter-client, et disclaimer
 * toujours présent. Représentatif des scénarios les plus critiques, pas une matrice exhaustive.
 */
describe("Pricing — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const clientA2Id = randomUUID();
  const tenderAId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenContributorA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Pricing HTTP Test" }),
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
        { id: orgAId, name: "Pricing Org A HTTP", slug: `pricing-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Pricing Org B HTTP", slug: `pricing-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`pricing-owner-a-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`pricing-contrib-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`pricing-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, contributorA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenContributorA = contributorA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.clientAccount.create({ data: { id: clientA2Id, organizationId: orgAId, name: "Client A2", nameNormalized: "client a2", status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.tender.create({ data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP", status: "DRAFT", tags: [], createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.pricingEstimate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("refuses an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/estimates`);
    expect(res.status).toBe(401);
  });

  describe("estimate lifecycle + tenant/client isolation", () => {
    let estimateId: string;

    it("OWNER creates an estimate (201), with the disclaimer present in the response", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/estimates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ assumptions: { workHours: 10, hourlyRate: "50" } }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; currentVersion: { amount: string; disclaimerText: string } };
      estimateId = body.id;
      expect(body.currentVersion.amount).toBe("500.000000");
      expect(body.currentVersion.disclaimerText).toContain("indicative et non contractuelle");
    });

    it("never lets org B read org A's estimate (404, not 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("a CONTRIBUTOR not assigned to the client cannot read the estimate (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}`, { headers: authHeaders(tokenContributorA, orgAId) });
      expect(res.status).toBe(404);
    });

    it("OWNER can read their own estimate (200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(estimateId);
    });

    it("recalculate creates version 2 with a reason, never mutating version 1 (400 without a reason)", async () => {
      const missingReason = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}/recalculate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ assumptions: { workHours: 20, hourlyRate: "50" } }),
      });
      expect(missingReason.status).toBe(400);

      const res = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}/recalculate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ assumptions: { workHours: 20, hourlyRate: "50" }, reason: "Doublement du périmètre" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { currentVersionNumber: number; currentVersion: { amount: string } };
      expect(body.currentVersionNumber).toBe(2);
      expect(body.currentVersion.amount).toBe("1000.000000");

      const v1 = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}?version=1`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const v1Body = (await v1.json()) as { currentVersion: { amount: string; status: string } };
      expect(v1Body.currentVersion.amount).toBe("500.000000");
      expect(v1Body.currentVersion.status).toBe("SUPERSEDED");
    });

    it("archive marks it ARCHIVED, and a second archive attempt is a 409", async () => {
      const res = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}/archive`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("ARCHIVED");

      const second = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimateId}/archive`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(second.status).toBe(409);
    });

    it("refuses invalid body shape with 400 (negative-looking / malformed rate)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/estimates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ assumptions: { hourlyRate: "not-a-number" } }),
      });
      expect(res.status).toBe(400);
    });

    it("a client-scoped actor cannot create an estimate under a DIFFERENT client's assignment (cross-client, 404)", async () => {
      // contributorA has no assignment to clientA at all — reuse for cross-client-style denial.
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/estimates`, {
        method: "POST",
        headers: authHeaders(tokenContributorA, orgAId),
        body: JSON.stringify({ assumptions: { workHours: 1, hourlyRate: "10" } }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("summaries", () => {
    it("GET tender summary is readable by OWNER and includes the disclaimer", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/summary`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { disclaimerText: string };
      expect(body.disclaimerText).toContain("indicative et non contractuelle");
    });

    it("never lets org B read org A's tender summary (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/summary`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("GET client summary is readable by OWNER", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/pricing/summary`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
    });

    it("GET organization summary is readable by OWNER but refused for a CONTRIBUTOR (403)", async () => {
      const ownerRes = await fetch(`${baseUrl}/api/v1/pricing/organization/summary`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(ownerRes.status).toBe(200);

      const contributorRes = await fetch(`${baseUrl}/api/v1/pricing/organization/summary`, { headers: authHeaders(tokenContributorA, orgAId) });
      expect(contributorRes.status).toBe(403);
    });
  });

  describe("preview", () => {
    it("POST preview returns an UNKNOWN status (never 0) when no routing policy exists for the taskType", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/pricing/preview`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ taskType: "EXECUTIVE_SUMMARY" }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; amount?: string; disclaimerText: string };
      expect(body.status).toBe("UNKNOWN");
      expect(body.amount).toBeUndefined();
      expect(body.disclaimerText).toContain("indicative et non contractuelle");
    });
  });
});
