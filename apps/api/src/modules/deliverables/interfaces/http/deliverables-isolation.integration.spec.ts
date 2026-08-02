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
 * Mission Sprint 8A.1 §19 — "teste avec 2 organisations et 2 clients. Un utilisateur du client A ne
 * doit jamais pouvoir lire/générer/modifier/valider/sélectionner/exporter les livrables/révisions/
 * générations/références/templates privés/thème du client B. Toute fuite est P0." Ce fichier couvre
 * EXPLICITEMENT la matrice 2 organisations × 2 clients (au-delà de la simple isolation inter-org déjà
 * prouvée dans `deliverables-http.integration.spec.ts`), plus une 3ème preuve indépendante — au
 * niveau HTTP — que seule une révision VALIDÉE peut être sélectionnée pour l'export (mission §11,
 * déjà prouvée au niveau domaine et au niveau infrastructure/application ailleurs).
 */
describe("Deliverables — isolation inter-tenant et inter-client (2 organisations × 2 clients, HTTP réel)", () => {
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
      body: JSON.stringify({ email, password, displayName: "Deliverables Isolation Test" }),
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
        { id: orgAId, name: "Isolation Org A", slug: `isolation-org-a-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Isolation Org B", slug: `isolation-org-b-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`isolation-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`isolation-owner-b-${randomUUID()}@smoke.test`);
    const contributorA1 = await registerAndLogin(`isolation-contributor-a1-${randomUUID()}@smoke.test`);
    const viewerA1 = await registerAndLogin(`isolation-viewer-a1-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, contributorA1.userId, viewerA1.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenContributorA1 = contributorA1.token;
    tokenViewerA1 = viewerA1.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    // Rôle d'organisation MINIMAL (CONTRIBUTOR n'a AUCUN accès de portefeuille — voir
    // `ROLE_CLIENT_PORTFOLIO_PERMISSIONS`) : leur seul accès passe par l'affectation client
    // ci-dessous, exactement le scénario mandaté "MEMBER affecté" / "MEMBER non affecté".
    await addMembership({ organizationId: orgAId, userId: contributorA1.userId, role: OrganizationRole.Contributor });
    await addMembership({ organizationId: orgAId, userId: viewerA1.userId, role: OrganizationRole.Contributor });

    await prisma.clientAccount.createMany({
      data: [
        { id: clientA1Id, organizationId: orgAId, name: "Client A1", nameNormalized: "client a1", status: "ACTIVE", createdBy: ownerA.userId },
        { id: clientA2Id, organizationId: orgAId, name: "Client A2", nameNormalized: "client a2", status: "ACTIVE", createdBy: ownerA.userId },
      ],
    });
    await prisma.tender.createMany({
      data: [
        { id: tenderA1Id, organizationId: orgAId, clientAccountId: clientA1Id, title: "Marché Client A1", status: "DRAFT", tags: [], createdBy: ownerA.userId },
        { id: tenderA2Id, organizationId: orgAId, clientAccountId: clientA2Id, title: "Marché Client A2", status: "DRAFT", tags: [], createdBy: ownerA.userId },
      ],
    });

    // contributorA1 affecté UNIQUEMENT au client A1 (jamais A2) ; viewerA1 affecté en VIEWER
    // uniquement au client A1 — mission §17/§19 "MEMBER affecté" vs "MEMBER non affecté".
    await prisma.clientAssignment.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: contributorA1.userId, role: "CONTRIBUTOR", createdBy: ownerA.userId },
        { id: randomUUID(), organizationId: orgAId, clientAccountId: clientA1Id, userId: viewerA1.userId, role: "VIEWER", createdBy: ownerA.userId },
      ],
    });
  }, 60000);

  afterAll(async () => {
    await prisma.deliverableComment.deleteMany({ where: { organizationId: orgAId } });
    await prisma.deliverableRevision.deleteMany({ where: { organizationId: orgAId } });
    await prisma.deliverableSection.deleteMany({ where: { organizationId: orgAId } });
    await prisma.deliverable.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("a member assigned to client A1 can read A1's deliverables, but gets 404 (never 403 — no existence leak) reading A2's", async () => {
    const okRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/deliverables`, { headers: authHeaders(tokenContributorA1, orgAId) });
    expect(okRes.status).toBe(200);

    const forbiddenRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA2Id}/deliverables`, { headers: authHeaders(tokenContributorA1, orgAId) });
    expect(forbiddenRes.status).toBe(404);
  });

  it("organization B (a different tenant entirely) cannot read organization A's client A1 deliverables", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/deliverables`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(res.status).toBe(404);
  });

  it("a VIEWER assigned to client A1 can read but cannot write (add a comment) — 403, permission missing", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/deliverables`, { headers: authHeaders(tokenViewerA1, orgAId) });
    expect(listRes.status).toBe(200);
    const deliverables = (await listRes.json()) as { id: string }[];
    const anyDeliverable = deliverables[0]!;

    const writeRes = await fetch(`${baseUrl}/api/v1/deliverables/${anyDeliverable.id}/comments`, {
      method: "POST",
      headers: authHeaders(tokenViewerA1, orgAId),
      body: JSON.stringify({ content: "Ceci devrait être refusé." }),
    });
    expect(writeRes.status).toBe(403);
  });

  it("select-for-export refuses a DRAFT (never submitted/validated) revision — 422, third independent proof of the mission §11 absolute rule", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA1Id}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;

    // Aucun template actif pour ce Tender : crée directement une section + révision en base pour
    // isoler ce test de la matérialisation par template (déjà couverte ailleurs).
    const sectionId = randomUUID();
    await prisma.deliverableSection.create({
      data: { id: sectionId, organizationId: orgAId, deliverableId: memo.id, code: "DRAFT_TEST", title: "Section brouillon", order: 0, headingLevel: 1, mandatory: false },
    });

    const createRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Toujours en brouillon." }] }),
    });
    expect(createRes.status).toBe(201);
    const draftRevision = (await createRes.json()) as { id: string; status: string };
    expect(draftRevision.status).toBe("DRAFT");

    const selectRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${draftRevision.id}/select-for-export`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(selectRes.status).toBe(422);
    const body = (await selectRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DELIVERABLE_REVISION_NOT_VALIDATED_FOR_EXPORT");
  });
});
