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
 * Mission V2 Sprint 2 §13 — répertoire ORGANISATIONNEL de sous-traitants : cycle de vie complet
 * (création TO_VERIFY → archivage → restauration), doublon SIRET, permissions (READ_ONLY refusé en
 * écriture, CONTRIBUTOR autorisé en écriture mais refusé en archivage), isolation multi-tenant.
 */
describe("Subcontractors — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;
  let tokenReadOnly: string;
  let tokenContributor: string;
  let tokenOtherOrg: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Subcontractors Test" }),
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

  function authHeaders(token: string, organizationId = orgId): Record<string, string> {
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

    await prisma.organization.create({ data: { id: orgId, name: "Subcontractors Org", slug: `subcontractors-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: otherOrgId, name: "Subcontractors Other Org", slug: `subcontractors-other-org-${otherOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`subcontractors-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const readOnly = await registerAndLogin(`subcontractors-readonly-${randomUUID()}@smoke.test`);
    userIds.push(readOnly.userId);
    tokenReadOnly = readOnly.token;

    const contributor = await registerAndLogin(`subcontractors-contributor-${randomUUID()}@smoke.test`);
    userIds.push(contributor.userId);
    tokenContributor = contributor.token;

    const otherOrgOwner = await registerAndLogin(`subcontractors-other-org-owner-${randomUUID()}@smoke.test`);
    userIds.push(otherOrgOwner.userId);
    tokenOtherOrg = otherOrgOwner.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: readOnly.userId, role: OrganizationRole.ReadOnly, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: contributor.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: otherOrgId, userId: otherOrgOwner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
  }, 60000);

  afterAll(async () => {
    await prisma.subcontractorProfileDocument.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.subcontractorInsurance.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.subcontractorCertification.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.subcontractorReference.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.subcontractorProfile.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgId, otherOrgId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await app.close();
  });

  let profileId: string;

  it("POST /subcontractor-profiles creates a profile defaulting to TO_VERIFY (never auto-created as ACTIVE)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Sous-traitant Test SARL", siren: "356000000", siret: "35600000000048" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("TO_VERIFY");
    profileId = body.id;
  });

  it("rejects a duplicate SIRET within the SAME organization unless confirmDuplicate=true", async () => {
    const duplicate = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Sous-traitant", siret: "35600000000048" }),
    });
    expect(duplicate.status).toBe(422);

    const confirmed = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Sous-traitant", siret: "35600000000048", confirmDuplicate: true }),
    });
    expect(confirmed.status).toBe(201);
  });

  it("a READ_ONLY member can list/read but cannot create (403)", async () => {
    const list = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, { headers: authHeaders(tokenReadOnly) });
    expect(list.status).toBe(200);

    const create = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: authHeaders(tokenReadOnly),
      body: JSON.stringify({ legalName: "Interdit" }),
    });
    expect(create.status).toBe(403);
  });

  it("a CONTRIBUTOR can create/update but is denied Archive (organization-role matrix, not ClientPermission)", async () => {
    const create = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: authHeaders(tokenContributor),
      body: JSON.stringify({ legalName: "Sous-traitant Contributeur" }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };

    const archive = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${created.id}/archive`, { method: "POST", headers: authHeaders(tokenContributor) });
    expect(archive.status).toBe(403);
  });

  it("archives then restores a profile (TO_VERIFY <-> ARCHIVED transition, never a physical delete)", async () => {
    const archive = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/archive`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(archive.status).toBe(200);
    const archived = (await archive.json()) as { status: string };
    expect(archived.status).toBe("ARCHIVED");

    const restore = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/restore`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(restore.status).toBe(200);
    const restored = (await restore.json()) as { status: string };
    expect(restored.status).toBe("TO_VERIFY");

    const stillInDb = await prisma.subcontractorProfile.findUnique({ where: { id: profileId } });
    expect(stillInDb).not.toBeNull();
  });

  it("creates a reference then archives it — never a physical delete (correctif audit Codex P1, mission §6 'conserver l'historique')", async () => {
    const create = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/references`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ projectName: "Chantier Test" }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string; status: string };
    expect(created.status).toBe("ACTIVE");

    const list = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/references`, { headers: authHeaders(tokenOwner) });
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const archiveRes = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/references/${created.id}`, { method: "DELETE", headers: authHeaders(tokenOwner) });
    expect(archiveRes.status).toBe(200);

    // La ligne reste en base avec status=ARCHIVED — jamais un DELETE SQL (P1).
    const stillInDb = await prisma.subcontractorReference.findUnique({ where: { id: created.id } });
    expect(stillInDb).not.toBeNull();
    expect(stillInDb?.status).toBe("ARCHIVED");

    const listAfter = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}/references`, { headers: authHeaders(tokenOwner) });
    const afterBody = (await listAfter.json()) as { id: string; status: string }[];
    expect(afterBody.find((r) => r.id === created.id)?.status).toBe("ARCHIVED");
  });

  it("a member of another organization cannot see this organization's subcontractor repertory (404 on direct access)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/subcontractor-profiles/${profileId}`, { headers: authHeaders(tokenOtherOrg, otherOrgId) });
    expect(res.status).toBe(404);

    const list = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, { headers: authHeaders(tokenOtherOrg, otherOrgId) });
    const profiles = (await list.json()) as { id: string }[];
    expect(profiles.find((p) => p.id === profileId)).toBeUndefined();
  });
});
