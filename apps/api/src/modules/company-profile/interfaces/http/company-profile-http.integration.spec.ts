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
 * Mission V2 Sprint 2 §13 — parcours réel HTTP + PostgreSQL : identité légale (upsert, doublon
 * SIRET, format invalide), permissions (CONTRIBUTOR sans affectation client refusé, VIEWER avec
 * affectation mais sans droit bancaire refusé), masquage IBAN en liste, isolation multi-tenant.
 */
describe("Company Profile — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const clientAccountId = randomUUID();
  const secondClientAccountId = randomUUID();
  const otherOrgClientAccountId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;
  let tokenNoAssignment: string;
  let tokenViewer: string;
  let tokenClientManagerA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Company Profile Test" }),
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

    await prisma.organization.create({ data: { id: orgId, name: "Company Profile Org", slug: `company-profile-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: otherOrgId, name: "Company Profile Other Org", slug: `company-profile-other-org-${otherOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`company-profile-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const noAssignment = await registerAndLogin(`company-profile-no-assignment-${randomUUID()}@smoke.test`);
    userIds.push(noAssignment.userId);
    tokenNoAssignment = noAssignment.token;

    const viewer = await registerAndLogin(`company-profile-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    tokenViewer = viewer.token;

    const clientManagerA = await registerAndLogin(`company-profile-manager-a-${randomUUID()}@smoke.test`);
    userIds.push(clientManagerA.userId);
    tokenClientManagerA = clientManagerA.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: noAssignment.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: viewer.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: clientManagerA.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Profil Entreprise", nameNormalized: "client profil entreprise", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.clientAccount.create({ data: { id: secondClientAccountId, organizationId: orgId, name: "Client Profil Entreprise 2", nameNormalized: "client profil entreprise 2", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.clientAccount.create({ data: { id: otherOrgClientAccountId, organizationId: otherOrgId, name: "Client Autre Org", nameNormalized: "client autre org", status: "ACTIVE", createdBy: owner.userId } });

    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: owner.userId },
    });
    // Correctif audit Codex P0 — affecté CLIENT_MANAGER sur `clientAccountId` UNIQUEMENT, jamais
    // sur `secondClientAccountId` : sert à prouver qu'un accès légitime sur le Client A ne permet
    // plus de muter une ressource du Client B de la même organisation.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, userId: clientManagerA.userId, role: "CLIENT_MANAGER", createdBy: owner.userId },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.companyReferenceDocument.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyReference.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyHumanResource.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyMaterialResource.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyCertification.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyInsurance.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyBankAccount.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.documentClientAccountAssociation.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgId, otherOrgId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await app.close();
  });

  it("PATCH .../legal-identity upserts, rejects an invalid SIREN format, then accepts a valid one", async () => {
    const invalid = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ siren: "123" }),
    });
    expect(invalid.status).toBe(422);

    const valid = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({
        legalName: "Entreprise Test SAS",
        siren: "356000000",
        siretPrincipal: "35600000000048",
        addressLine: "12 rue de la République",
        postalCode: "75001",
        city: "Paris",
      }),
    });
    expect(valid.status).toBe(200);
    const body = (await valid.json()) as { legalName: string; siretPrincipal: string };
    expect(body.legalName).toBe("Entreprise Test SAS");
    expect(body.siretPrincipal).toBe("35600000000048");
  });

  it("PATCH .../legal-identity rejects a duplicate SIRET across two ClientAccounts of the SAME organization, unless confirmDuplicate=true", async () => {
    const duplicate = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Entreprise", siretPrincipal: "35600000000048" }),
    });
    expect(duplicate.status).toBe(409);

    const confirmed = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Entreprise", siretPrincipal: "35600000000048", confirmDuplicate: true }),
    });
    expect(confirmed.status).toBe(200);
  });

  it("rejects mass assignment — an unknown field in the body is a validation error (422), never silently ignored", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "X", organizationId: randomUUID() }),
    });
    expect(res.status).toBe(400);
  });

  it("a CONTRIBUTOR with no ClientAssignment on this client is denied — 404, never leaking existence (same convention as Client Portfolio)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, { headers: authHeaders(tokenNoAssignment) });
    expect(res.status).toBe(404);
  });

  it("a VIEWER can read the profile but cannot manage it (403)", async () => {
    const readRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, { headers: authHeaders(tokenViewer) });
    expect(readRes.status).toBe(200);

    const writeRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenViewer),
      body: JSON.stringify({ legalName: "Should Be Denied" }),
    });
    expect(writeRes.status).toBe(403);
  });

  it("a VIEWER (no dedicated banking permission) is denied access to bank accounts entirely (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts`, { headers: authHeaders(tokenViewer) });
    expect(res.status).toBe(403);
  });

  it("bank accounts are created with a full IBAN but returned MASKED in the list view", async () => {
    const create = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ accountHolder: "Entreprise Test SAS", iban: "FR7630006000011234567890189" }),
    });
    expect(create.status).toBe(201);

    const list = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts`, { headers: authHeaders(tokenOwner) });
    expect(list.status).toBe(200);
    const accounts = (await list.json()) as { iban: string }[];
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]!.iban).not.toBe("FR7630006000011234567890189");
    expect(accounts[0]!.iban.endsWith("0189")).toBe(true);
    expect(accounts[0]!.iban).toContain("•");
  });

  it("a bank account is archived, never physically deleted, and is excluded from active usage but still listed", async () => {
    const create = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/bank-accounts`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ accountHolder: "Autre Entreprise", iban: "FR7630006000011234567890189" }),
    });
    const created = (await create.json()) as { id: string; status: string };
    expect(created.status).toBe("ACTIVE");

    const archive = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/bank-accounts/${created.id}/archive`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(archive.status).toBe(200);
    const archived = (await archive.json()) as { status: string };
    expect(archived.status).toBe("ARCHIVED");

    const stillInDb = await prisma.companyBankAccount.findUnique({ where: { id: created.id } });
    expect(stillInDb).not.toBeNull();
  });

  it("correctif audit Codex P0 — a CLIENT_MANAGER authorized on Client A cannot mutate a Client B resource of the SAME org by supplying its id under Client A's route", async () => {
    // Compte bancaire créé sous le Client B (secondClientAccountId), auquel clientManagerA n'a
    // AUCUNE affectation.
    const createOnClientB = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/bank-accounts`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ accountHolder: "Client B Holder", iban: "FR7630006000011234567890189" }),
    });
    expect(createOnClientB.status).toBe(201);
    const clientBAccount = (await createOnClientB.json()) as { id: string };

    // clientManagerA EST autorisé (CLIENT_MANAGER) sur `clientAccountId` (Client A) — la route
    // passe donc le contrôle d'accès de la policy centralisée — mais fournit l'id d'une ressource
    // appartenant au Client B. Avant le correctif, la mutation aboutissait quand même (P0).
    const attack = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts/${clientBAccount.id}/archive`, {
      method: "POST",
      headers: authHeaders(tokenClientManagerA),
    });
    expect(attack.status).toBe(404);

    const stillActive = await prisma.companyBankAccount.findUnique({ where: { id: clientBAccount.id } });
    expect(stillActive?.status).toBe("ACTIVE");
    expect(stillActive?.clientAccountId).toBe(secondClientAccountId);
  });

  it("cross-organization access to a ClientAccount returns 404, never leaking its existence", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${otherOrgClientAccountId}/legal-identity`, { headers: authHeaders(tokenOwner, orgId) });
    expect(res.status).toBe(404);
  });

  it("GET .../profile aggregates satellites and computes a per-category completeness — never a single commercial score", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/profile`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as { completeness: Record<string, string> };
    expect(profile.completeness.identity).toBe("COMPLETE");
    expect(profile.completeness.banking).toBe("COMPLETE");
    expect(profile.completeness.references).toBe("MISSING");
    expect(Object.keys(profile.completeness)).not.toContain("score");
  });
});
