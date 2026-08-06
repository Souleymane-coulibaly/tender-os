import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";

/**
 * V2 Sprint 3 — preuve HTTP réelle (NestJS + PostgreSQL réels) des nouvelles routes/champs :
 * profil consolidé, restauration, changement contrôlé de candidat, CRUD Acheteur (isolation
 * organisation), et le round-trip des nouveaux champs Tender/Lot. Complète (ne duplique pas)
 * tenders-client-isolation-http.integration.spec.ts, dédié à l'isolation inter-client.
 */
describe("Tenders — Sprint 3 (fiche Tender, acheteur, profil, restauration) — HTTP réel", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const userIds: string[] = [];
  let adminToken: string;
  let otherOrgToken: string;
  let clientAId: string;
  let clientBId: string;
  let tenderId: string;
  let buyerId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "HTTP Sprint 3 Test" }),
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

  function asAdmin(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
        "X-Organization-Id": orgId,
        ...init?.headers,
      },
    });
  }

  function asOtherOrg(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${otherOrgToken}`,
        "X-Organization-Id": otherOrgId,
        ...init?.headers,
      },
    });
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
        { id: orgId, name: "Org Sprint 3 HTTP", slug: `org-sprint3-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrgId, name: "Org Sprint 3 HTTP (autre)", slug: `org-sprint3-http-other-${otherOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const owner = await registerAndLogin(`http-s3-owner-${randomUUID()}@smoke.test`);
    const otherOwner = await registerAndLogin(`http-s3-other-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, otherOwner.userId);
    adminToken = owner.token;
    otherOrgToken = otherOwner.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: otherOrgId, userId: otherOwner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const clientA = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client A Sprint 3", nameNormalized: "client a sprint 3", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAId = clientA.id;
    const clientB = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client B Sprint 3", nameNormalized: "client b sprint 3", status: "ACTIVE", createdBy: owner.userId },
    });
    clientBId = clientB.id;
  }, 30000);

  afterAll(async () => {
    await prisma.tenderStatusHistoryEntry.deleteMany({ where: { organizationId: orgId } });
    await prisma.tenderLot.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.buyer.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgId, otherOrgId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await app.close();
  }, 30000);

  it("creates a Buyer (organisation-scopé, jamais un ClientAccount)", async () => {
    const res = await asAdmin("/api/v1/buyers", {
      method: "POST",
      body: JSON.stringify({ name: "Mairie de Sprint 3", city: "Lyon" }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; siret?: string };
    buyerId = body.id;
    expect(body.name).toBe("Mairie de Sprint 3");
    expect(body.siret).toBeUndefined();
  });

  it("a Buyer from another organisation is invisible (404, tenant isolation)", async () => {
    const res = await asOtherOrg(`/api/v1/buyers/${buyerId}`);
    expect(res.status).toBe(404);
  });

  it("creates a Tender with the new Sprint 3 fields (buyerId, amounts, dates, booleans) and round-trips them", async () => {
    const res = await asAdmin("/api/v1/tenders", {
      method: "POST",
      body: JSON.stringify({
        clientAccountId: clientAId,
        title: "Marche Sprint 3",
        buyerId,
        estimatedAmount: "500000",
        minimumAmount: "400000",
        maximumAmount: "600000",
        isFrameworkAgreement: true,
        awardType: "MONO_AWARDEE",
        variantsAllowed: false,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; buyerId: string; minimumAmount: string; maximumAmount: string; awardType: string };
    tenderId = body.id;
    expect(body.buyerId).toBe(buyerId);
    expect(Number(body.minimumAmount)).toBe(400000);
    expect(Number(body.maximumAmount)).toBe(600000);
    expect(body.awardType).toBe("MONO_AWARDEE");
  });

  it("refuses creation with an unknown buyerId", async () => {
    const res = await asAdmin("/api/v1/tenders", {
      method: "POST",
      body: JSON.stringify({ clientAccountId: clientAId, title: "Marche invalide", buyerId: randomUUID() }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("BUYER_NOT_FOUND");
  });

  it("creates a lot with the new Sprint 3 fields (cpv, selectedForResponse, solo/group)", async () => {
    const res = await asAdmin(`/api/v1/tenders/${tenderId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber: "01", title: "Lot travaux", cpvMain: "45000000", selectedForResponse: false, soloAllowed: false }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { cpvMain: string; selectedForResponse: boolean; soloAllowed: boolean; groupAllowed: boolean };
    expect(body.cpvMain).toBe("45000000");
    expect(body.selectedForResponse).toBe(false);
    expect(body.soloAllowed).toBe(false);
    expect(body.groupAllowed).toBe(true);
  });

  it("GET /tenders/:id/profile aggregates candidate/buyer/lots/completeness in one call", async () => {
    const res = await asAdmin(`/api/v1/tenders/${tenderId}/profile`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tender: { id: string };
      candidate: { id: string };
      buyer: { id: string } | null;
      lots: unknown[];
      completeness: { buyer: string; lots: string };
    };
    expect(body.tender.id).toBe(tenderId);
    expect(body.candidate.id).toBe(clientAId);
    expect(body.buyer?.id).toBe(buyerId);
    expect(body.lots).toHaveLength(1);
    expect(body.completeness.buyer).toBe("COMPLETE");
    expect(body.completeness.lots).toBe("COMPLETE");
  });

  it("POST /tenders/:id/candidate changes the candidate while still DRAFT and is audited", async () => {
    const res = await asAdmin(`/api/v1/tenders/${tenderId}/candidate`, {
      method: "POST",
      body: JSON.stringify({ clientAccountId: clientBId, reason: "Test HTTP changement de candidat" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clientAccountId: string };
    expect(body.clientAccountId).toBe(clientBId);

    const auditEntry = await prisma.auditLog.findFirst({ where: { organizationId: orgId, action: "tender.candidate_changed" } });
    expect(auditEntry).not.toBeNull();
  });

  it("PATCH /tenders/:id (UpdateTenderBodySchema) rejects an attempt to smuggle clientAccountId (mass assignment)", async () => {
    const res = await asAdmin(`/api/v1/tenders/${tenderId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Titre", clientAccountId: clientAId }),
    });
    expect(res.status).toBe(400);
  });

  it("refuses to change candidate once the tender is past IN_ANALYSIS", async () => {
    await asAdmin(`/api/v1/tenders/${tenderId}/status`, { method: "POST", body: JSON.stringify({ status: "IN_ANALYSIS" }) });
    await asAdmin(`/api/v1/tenders/${tenderId}/status`, { method: "POST", body: JSON.stringify({ status: "READY" }) });

    const res = await asAdmin(`/api/v1/tenders/${tenderId}/candidate`, {
      method: "POST",
      body: JSON.stringify({ clientAccountId: clientAId }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TENDER_CANDIDATE_CHANGE_NOT_ALLOWED");
  });

  it("archives then restores the tender (correctif restauration V2 Sprint 3 §7/§29)", async () => {
    const archiveRes = await asAdmin(`/api/v1/tenders/${tenderId}/archive`, { method: "POST" });
    expect(archiveRes.status).toBe(200);
    const archived = (await archiveRes.json()) as { status: string };
    expect(archived.status).toBe("ARCHIVED");

    const restoreRes = await asAdmin(`/api/v1/tenders/${tenderId}/restore`, { method: "POST" });
    expect(restoreRes.status).toBe(200);
    const restored = (await restoreRes.json()) as { status: string; archivedAt?: string };
    expect(restored.status).toBe("DRAFT");
    expect(restored.archivedAt).toBeUndefined();
  });

  it("archives then restores the Buyer", async () => {
    const archiveRes = await asAdmin(`/api/v1/buyers/${buyerId}/archive`, { method: "POST" });
    expect(archiveRes.status).toBe(200);
    const archived = (await archiveRes.json()) as { archivedAt?: string };
    expect(archived.archivedAt).toBeDefined();

    const listWithoutArchived = await asAdmin("/api/v1/buyers");
    const withoutArchivedBody = (await listWithoutArchived.json()) as { id: string }[];
    expect(withoutArchivedBody.find((buyer) => buyer.id === buyerId)).toBeUndefined();

    const restoreRes = await asAdmin(`/api/v1/buyers/${buyerId}/restore`, { method: "POST" });
    expect(restoreRes.status).toBe(200);
    const restored = (await restoreRes.json()) as { archivedAt?: string };
    expect(restored.archivedAt).toBeUndefined();
  });
});
