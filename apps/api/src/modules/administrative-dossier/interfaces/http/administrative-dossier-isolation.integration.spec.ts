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
 * Sprint 8C Phase 1 — isolation multi-tenant du dossier administratif (mission — "aucune fuite
 * multi-tenant, aucun accès par simple ID sans contrôle de l'organisation et du Tender"), même
 * motif que `deliverables-isolation.integration.spec.ts` : 2 organisations × 2 clients.
 */
describe("Administrative Dossier — isolation inter-tenant et inter-client (2 organisations × 2 clients, HTTP réel)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientA1Id = randomUUID();
  const clientA2Id = randomUUID();
  const tenderA1Id = randomUUID();
  const tenderA2Id = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenContributorA1: string;
  let tokenViewerA1: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Administrative Dossier Isolation Test", termsAccepted: true }),
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
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "AD Isolation Org A", slug: `ad-isolation-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "AD Isolation Org B", slug: `ad-isolation-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    // Checkpoint TENDEROS-2.1-P2.3-E1.3 — EnsureAdministrativeDossierUseCase gate désormais
    // canOperateOnTender : ENTERPRISE (illimité) évite tout effet de bord de quota/AO credits,
    // même motif déjà établi dans dce-http.integration.spec.ts/analysis-http.integration.spec.ts.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const ownerA = await registerAndLogin(`ad-isolation-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`ad-isolation-owner-b-${randomUUID()}@smoke.test`);
    const contributorA1 = await registerAndLogin(`ad-isolation-contributor-a1-${randomUUID()}@smoke.test`);
    const viewerA1 = await registerAndLogin(`ad-isolation-viewer-a1-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, contributorA1.userId, viewerA1.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenContributorA1 = contributorA1.token;
    tokenViewerA1 = viewerA1.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA1.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgAId, userId: viewerA1.userId, role: OrganizationRole.Contributor });

    await prisma.clientAccount.createMany({
      data: [
        { id: clientA1Id, organizationId: orgAId, name: "AD Client A1", nameNormalized: "ad client a1", status: "ACTIVE", createdBy: ownerA.userId },
        { id: clientA2Id, organizationId: orgAId, name: "AD Client A2", nameNormalized: "ad client a2", status: "ACTIVE", createdBy: ownerA.userId },
      ],
    });
    await prisma.tender.createMany({
      data: [
        { id: tenderA1Id, organizationId: orgAId, clientAccountId: clientA1Id, title: "Marché AD Client A1", status: "DRAFT", tags: [], createdBy: ownerA.userId },
        { id: tenderA2Id, organizationId: orgAId, clientAccountId: clientA2Id, title: "Marché AD Client A2", status: "DRAFT", tags: [], createdBy: ownerA.userId },
      ],
    });

    await prisma.clientAssignment.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: contributorA1.userId, role: "CONTRIBUTOR", createdBy: ownerA.userId },
        { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: viewerA1.userId, role: "VIEWER", createdBy: ownerA.userId },
      ],
    });

    // Dossier créé pour A1 uniquement — A2 reste sans dossier pour prouver le 404 "not found",
    // distinct du 404 "no existence leak" de la policy client.
    await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
  }, 60000);

  afterAll(async () => {
    await prisma.administrativeRequirement.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // Checkpoint 2.1-A4 (correctif hygiène de test) — voir le commentaire identique dans
    // administrative-dossier-generation-http.integration.spec.ts.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("a member assigned to client A1 can read A1's dossier, but gets 404 (never 403 — no existence leak) reading A2's", async () => {
    const okRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-dossier`, { headers: authHeaders(tokenContributorA1, orgAId) });
    expect(okRes.status).toBe(200);

    const forbiddenRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA2Id}/administrative-dossier`, { headers: authHeaders(tokenContributorA1, orgAId) });
    expect(forbiddenRes.status).toBe(404);
  });

  it("organization B (a different tenant entirely) cannot read organization A's client A1 dossier", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-dossier`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(res.status).toBe(404);
  });

  it("a VIEWER assigned to client A1 can read but cannot write (create a requirement) — 403, permission missing", async () => {
    const readRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-dossier`, { headers: authHeaders(tokenViewerA1, orgAId) });
    expect(readRes.status).toBe(200);

    const writeRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-requirements`, {
      method: "POST",
      headers: authHeaders(tokenViewerA1, orgAId),
      body: JSON.stringify({ title: "Attestation", requirementType: "DOCUMENT", expectedDocumentType: "ATTESTATION_FISCALE", required: true }),
    });
    expect(writeRes.status).toBe(403);
  });

  it("a CONTRIBUTOR (Manage, not Validate) can create a requirement but cannot confirm it — 403 on the strict-tier action", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/administrative-requirements`, {
      method: "POST",
      headers: authHeaders(tokenContributorA1, orgAId),
      body: JSON.stringify({ title: "Attestation sociale", requirementType: "DOCUMENT", expectedDocumentType: "ATTESTATION_SOCIALE", required: true }),
    });
    expect(createRes.status).toBe(201);
    const requirement = (await createRes.json()) as { id: string };

    const confirmRes = await fetch(`${baseUrl}/api/v1/administrative-requirements/${requirement.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenContributorA1, orgAId),
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    expect(confirmRes.status).toBe(403);

    // Le CLIENT_MANAGER (mission — même palier que ValidateDeliverable) peut, lui, confirmer :
    // vérifié ici via OWNER (palier organisation, superset strict — mission §"OWNER... accès à
    // tous les clients selon le modèle de permission existant").
    const confirmAsOwner = await fetch(`${baseUrl}/api/v1/administrative-requirements/${requirement.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ action: "CONFIRM" }),
    });
    expect(confirmAsOwner.status).toBe(200);
  });
});
