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
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14/§28) — preuve RÉELLE HTTP + PostgreSQL
 * de `POST /organization-memberships/invite-by-email` : résout un email vers un compte existant puis
 * délègue intégralement à `CreateMembershipUseCase` (même permission, même seat-limit atomique, même
 * unicité) — jamais un second moteur d'invitation. Mission §28 (SECURITY_MATRIX) : permission
 * manquante, cross-tenant (email d'un utilisateur d'une AUTRE organisation reste invitable seulement
 * si l'acteur y a lui-même les droits — jamais une fuite d'existence de compte sans permission), et
 * seat-limit toujours autoritaire côté backend.
 */
describe("POST /organization-memberships/invite-by-email (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string; email: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Invite By Email Test", termsAccepted: true }),
    });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken, email };
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

    await prisma.organization.create({
      data: { id: orgAId, name: "Invite By Email Org A", slug: `invite-by-email-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const ownerA = await registerAndLogin(`invite-owner-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId);
    tokenOwnerA = ownerA.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    // ENTERPRISE (illimité) — ce fichier ne porte pas sur users_max (déjà exhaustivement prouvé
    // ailleurs), seulement sur la résolution email -> compte.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgAId } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgAId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgAId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgAId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgAId } });
    await app.close();
  });

  it("resolves an existing account's email and creates the membership — same outcome as inviting by userId", async () => {
    const userB = await registerAndLogin(`invite-user-b-${randomUUID()}@smoke.test`);
    userIds.push(userB.userId);

    const res = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ email: userB.email, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { userId: string; role: string; status: string };
    expect(body.userId).toBe(userB.userId);
    expect(body.role).toBe("CONTRIBUTOR");
    expect(body.status).toBe("ACTIVE");
  });

  it("refuses cleanly (404 USER_NOT_FOUND) when no TenderOS account exists for the email — never a silent success, never a pending invitation invented", async () => {
    const res = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ email: `nobody-${randomUUID()}@smoke.test`, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("USER_NOT_FOUND");
  });

  it("refuses a malformed email with 422 INVALID_EMAIL_ADDRESS, before any membership lookup", async () => {
    const res = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ email: "not-an-email", role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_EMAIL_ADDRESS");
  });

  it("mission §28 (SECURITY_MATRIX) — an actor without organization:member:invite (READ_ONLY) is refused 403, even for an email that resolves to a real account", async () => {
    const viewer = await registerAndLogin(`invite-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgAId, userId: viewer.userId, role: OrganizationRole.ReadOnly, occurredAt: new Date() }),
    );

    const target = await registerAndLogin(`invite-target-${randomUUID()}@smoke.test`);
    userIds.push(target.userId);

    const res = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(viewer.token, orgAId),
      body: JSON.stringify({ email: target.email, role: "CONTRIBUTOR" }),
    });
    expect(res.status).toBe(403);

    // Négatif explicite — aucune membership fantôme créée par une tentative refusée.
    const listRes = await fetch(`${baseUrl}/api/v1/organization-memberships?limit=100`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const list = (await listRes.json()) as { items: { userId: string }[] };
    expect(list.items.some((m) => m.userId === target.userId)).toBe(false);
  });

  it("refuses inviting an email that is already a member of this organization (409 MEMBERSHIP_ALREADY_EXISTS)", async () => {
    const userE = await registerAndLogin(`invite-user-e-${randomUUID()}@smoke.test`);
    userIds.push(userE.userId);

    const first = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ email: userE.email, role: "CONTRIBUTOR" }),
    });
    expect(first.status).toBe(201);

    const second = await fetch(`${baseUrl}/api/v1/organization-memberships/invite-by-email`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ email: userE.email, role: "REVIEWER" }),
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("MEMBERSHIP_ALREADY_EXISTS");
  });
});
