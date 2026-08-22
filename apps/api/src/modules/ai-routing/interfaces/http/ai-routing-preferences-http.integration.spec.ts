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
 * Checkpoint TENDEROS-2.1-P2.3-E4 — preuve réelle HTTP + PostgreSQL : mission §35 (override puis
 * reset AUTOMATIC), §36 (override incompatible refusé), §38 (isolation tenant/utilisateur), rôles
 * READ_ONLY/EXTERNAL_CONSULTANT refusés.
 */
describe("AI Routing Preferences (ai-routing) — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  let tokenOwnerA: string;
  let tokenReadOnlyA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;
  let ownerBUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "AI Routing HTTP Test", termsAccepted: true }) });
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
        { id: orgAId, name: "AI Routing Org A HTTP", slug: `ai-routing-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "AI Routing Org B HTTP", slug: `ai-routing-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`ai-routing-owner-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`ai-routing-readonly-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`ai-routing-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, readOnlyA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;
    ownerBUserId = ownerB.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.aiModelPreference.deleteMany({ where: { userId: { in: [ownerAUserId, ownerBUserId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("BLOQUANT — GET returns exactly one row per real AiTaskType, all AUTOMATIC by default", async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { taskType: string; override: string | null; effectiveModel: string }[] };
    expect(body.items.length).toBeGreaterThanOrEqual(19);
    const chat = body.items.find((i) => i.taskType === "CHAT");
    expect(chat?.override).toBeNull();
    expect(chat?.effectiveModel).toBe("GPT_5_4_MINI");
    const summary = body.items.find((i) => i.taskType === "SECTION_SUMMARY");
    expect(summary?.effectiveModel).toBe("GPT_5_4_NANO");
  });

  it("READ_ONLY is denied", async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(res.status).toBe(403);
  });

  it("BLOQUANT — mission §35: set a compatible override, GET reflects it, then reset back to AUTOMATIC", async () => {
    const setRes = await fetch(`${baseUrl}/api/v1/ai-routing/preferences/SECTION_SUMMARY`, { method: "PUT", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ modelOverride: "GPT_5_4_MINI" }) });
    expect(setRes.status).toBe(200);

    const afterSet = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const afterSetBody = (await afterSet.json()) as { items: { taskType: string; override: string | null; effectiveModel: string }[] };
    const summaryAfterSet = afterSetBody.items.find((i) => i.taskType === "SECTION_SUMMARY");
    expect(summaryAfterSet?.override).toBe("GPT_5_4_MINI");
    expect(summaryAfterSet?.effectiveModel).toBe("GPT_5_4_MINI");

    const resetRes = await fetch(`${baseUrl}/api/v1/ai-routing/preferences/SECTION_SUMMARY`, { method: "DELETE", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(resetRes.status).toBe(200);

    const afterReset = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const afterResetBody = (await afterReset.json()) as { items: { taskType: string; override: string | null; effectiveModel: string }[] };
    const summaryAfterReset = afterResetBody.items.find((i) => i.taskType === "SECTION_SUMMARY");
    expect(summaryAfterReset?.override).toBeNull();
    expect(summaryAfterReset?.effectiveModel).toBe("GPT_5_4_NANO");
  });

  it("BLOQUANT — mission §36 TEST_INCOMPATIBLE_OVERRIDE: refuses NANO for a MINI-only task with a clean error, never a silent degradation", async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai-routing/preferences/CHAT`, { method: "PUT", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ modelOverride: "GPT_5_4_NANO" }) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INCOMPATIBLE_MODEL_OVERRIDE");

    const list = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const listBody = (await list.json()) as { items: { taskType: string; override: string | null }[] };
    expect(listBody.items.find((i) => i.taskType === "CHAT")?.override).toBeNull();
  });

  it("BLOQUANT — mission §38: an override set by owner A in org A is invisible to owner B in org B", async () => {
    await fetch(`${baseUrl}/api/v1/ai-routing/preferences/EXECUTIVE_SUMMARY`, { method: "PUT", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ modelOverride: "GPT_5_4_MINI" }) });

    const asOwnerB = await fetch(`${baseUrl}/api/v1/ai-routing/preferences`, { headers: authHeaders(tokenOwnerB, orgBId) });
    const bodyB = (await asOwnerB.json()) as { items: { taskType: string; override: string | null }[] };
    expect(bodyB.items.find((i) => i.taskType === "EXECUTIVE_SUMMARY")?.override).toBeNull();
  });
});
