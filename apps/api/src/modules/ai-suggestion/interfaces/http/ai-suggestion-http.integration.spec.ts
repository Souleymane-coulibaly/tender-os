import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { AiSuggestionFieldSchemaRegistry } from "../../application/services/ai-suggestion-field-schema-registry";

/**
 * Mission Sprint 1 §4/§8 — preuve HTTP + PostgreSQL réelle des contrôles multi-tenant et de
 * permission sur la surface AiSuggestion (aucune capacité de lecture/décision de suggestion IA
 * n'existait avant ce sprint : la matrice de test anti-IDOR est donc entièrement nouvelle).
 */
describe("AiSuggestion — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenReadOnlyA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "AiSuggestion HTTP Test", termsAccepted: true }),
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

  let tenderAId: string;

  async function seedPendingSuggestion(organizationId: string): Promise<string> {
    const id = randomUUID();
    await prisma.aiSuggestion.create({
      data: {
        id,
        organizationId,
        entityType: "TENDER_LOT",
        entityId: randomUUID(),
        fieldName: "title",
        parentTenderId: tenderAId,
        proposedValue: "Lot 1 — Travaux",
        confidence: 0.8,
        status: "PENDING",
        createdByProcess: "test.http-integration",
      },
    });
    return id;
  }

  async function seedPendingSuggestionWithUnregisteredField(organizationId: string): Promise<string> {
    const id = randomUUID();
    await prisma.aiSuggestion.create({
      data: {
        id,
        organizationId,
        entityType: "TENDER_LOT",
        entityId: randomUUID(),
        fieldName: "no-schema-registered-for-this-field",
        parentTenderId: tenderAId,
        proposedValue: "irrelevant",
        confidence: 0.5,
        status: "PENDING",
        createdByProcess: "test.http-integration",
      },
    });
    return id;
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

    // Simule ce qu'un futur module producteur ferait à son propre bootstrap (correctif audit
    // Codex P1-003) — la surface HTTP générique elle-même n'enregistre jamais de schéma métier.
    moduleRef.get(AiSuggestionFieldSchemaRegistry).register("TENDER_LOT", "title", z.string().min(1).max(300));

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "AiSuggestion Org A HTTP", slug: `ai-suggestion-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "AiSuggestion Org B HTTP", slug: `ai-suggestion-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`ai-suggestion-owner-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`ai-suggestion-readonly-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`ai-suggestion-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, readOnlyA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    // V2 Sprint 4 — parentTenderId est désormais obligatoire (FK composée réelle) : un Tender
    // (et son Client) doivent exister avant de pouvoir semer une suggestion.
    const clientA = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgAId, name: "Client AiSuggestion HTTP A", nameNormalized: "client ai suggestion http a", status: "ACTIVE", createdBy: ownerA.userId },
    });
    const tenderA = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA.id, title: "Tender AiSuggestion HTTP A", status: "DRAFT", tags: [], createdBy: ownerA.userId },
    });
    tenderAId = tenderA.id;

    // V2 Sprint 4 — `AI_SUGGESTION_TARGET_ACCESS_POLICY` est désormais rebindée globalement vers
    // `TendersAiSuggestionTargetAccessPolicy`, qui vérifie l'accès au Tender via `GetTenderUseCase`
    // (donc `AssertClientAccessUseCase` — READ_ONLY n'est ni OWNER ni ORGANIZATION_ADMIN, il lui
    // faut une `ClientAssignment` explicite sur `clientA`, même exigence que partout ailleurs dans
    // ce repo pour ce rôle organisationnel).
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA.id, userId: readOnlyA.userId, role: "VIEWER", createdBy: ownerA.userId },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // V2 Sprint 4 — Accept/Modify/Reject/Create écrivent désormais dans l'Outbox : à supprimer
    // avant l'organisation, sinon FK violée (même correctif que les autres modules Tenders).
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("lists and reads a suggestion within the owning organization", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const listRes = await fetch(`${baseUrl}/api/v1/ai-suggestions`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list.some((s) => s.id === suggestionId)).toBe(true);

    const getRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(getRes.status).toBe(200);
  });

  it("mission §4 — a suggestion from another organization is not found (404, anti-enumeration)", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const getRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(getRes.status).toBe(404);

    const acceptRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/accept`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(acceptRes.status).toBe(404);
  });

  it("a suggestion created for org A never appears in org B's list", async () => {
    await seedPendingSuggestion(orgAId);

    const listRes = await fetch(`${baseUrl}/api/v1/ai-suggestions`, { headers: authHeaders(tokenOwnerB, orgBId) });
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(list).toHaveLength(0);
  });

  it("mission §4 — READ_ONLY can read but never accept/modify/reject a suggestion (403)", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const getRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}`, { headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(getRes.status).toBe(200);

    const acceptRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/accept`, { method: "POST", headers: authHeaders(tokenReadOnlyA, orgAId) });
    expect(acceptRes.status).toBe(403);

    const rejectRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/reject`, { method: "POST", headers: authHeaders(tokenReadOnlyA, orgAId), body: JSON.stringify({}) });
    expect(rejectRes.status).toBe(403);
  });

  it("accepts a suggestion end-to-end and refuses a second decision on the same suggestion (409)", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const acceptRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/accept`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(acceptRes.status).toBe(200);
    const accepted = (await acceptRes.json()) as { status: string };
    expect(accepted.status).toBe("ACCEPTED");

    const secondDecision = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/reject`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(secondDecision.status).toBe(409);
  });

  it("modifies a suggestion, recording a distinct appliedValue from the original proposedValue", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const modifyRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/modify`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ editedValue: "Lot 1 — Gros œuvre (libellé corrigé)", reason: "Libellé exact du règlement de consultation" }),
    });
    expect(modifyRes.status).toBe(200);
    const modified = (await modifyRes.json()) as { status: string; appliedValue: unknown; proposedValue: unknown };
    expect(modified.status).toBe("MODIFIED");
    expect(modified.appliedValue).toBe("Lot 1 — Gros œuvre (libellé corrigé)");
    expect(modified.proposedValue).toBe("Lot 1 — Travaux");
  });

  it("mission Sprint 1 correctif audit Codex P1-003 — refuses to modify a suggestion whose (entityType, fieldName) has no centrally-registered schema (422)", async () => {
    const suggestionId = await seedPendingSuggestionWithUnregisteredField(orgAId);

    const modifyRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/modify`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ editedValue: "anything" }),
    });
    expect(modifyRes.status).toBe(422);
    const body = (await modifyRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AI_SUGGESTION_SCHEMA_NOT_REGISTERED");
  });

  it("rejects a suggestion, keeping the row queryable by status for audit", async () => {
    const suggestionId = await seedPendingSuggestion(orgAId);

    const rejectRes = await fetch(`${baseUrl}/api/v1/ai-suggestions/${suggestionId}/reject`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ reason: "Hors périmètre" }),
    });
    expect(rejectRes.status).toBe(200);

    const listRejected = await fetch(`${baseUrl}/api/v1/ai-suggestions?status=REJECTED`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const list = (await listRejected.json()) as Array<{ id: string; status: string }>;
    expect(list.some((s) => s.id === suggestionId && s.status === "REJECTED")).toBe(true);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`${baseUrl}/api/v1/ai-suggestions`, { headers: { "X-Organization-Id": orgAId } });
    expect(res.status).toBe(401);
  });
});
