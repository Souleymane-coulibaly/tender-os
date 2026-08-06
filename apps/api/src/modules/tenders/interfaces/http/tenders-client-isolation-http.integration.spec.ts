import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
// Même contournement que tenders-lots-http.integration.spec.ts : aucune API publique ne permet de
// créer la toute première Membership d'une organisation sans passer par une Membership déjà active.
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";

/**
 * Correction P0 — preuve HTTP réelle (NestJS + PostgreSQL réels) que l'isolation par CLIENT,
 * au sein d'une même organisation, est appliquée par toute mutation dérivée d'un Tender. Distinct
 * de tenders-lots-http.integration.spec.ts qui ne prouve que l'isolation inter-ORGANISATION (les
 * deux acteurs y sont ORGANIZATION_ADMIN, qui contourne toujours la vérification client) : ici, un
 * même acteur BID_MANAGER (permission Tenders large mais aucun bypass organisation) affecté
 * uniquement au Client A doit être refusé sur toute ressource dérivée d'un Tender du Client B,
 * bien qu'appartenant à la MÊME organisation, et rester autorisé sur le Client A.
 */
describe("Tenders — isolation HTTP inter-client au sein d'une même organisation (NestJS + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let memberToken: string;
  let clientAId: string;
  let clientBId: string;
  let tenderAId: string;
  let tenderBId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "HTTP Client Isolation Test" }),
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

  function asMember(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${memberToken}`,
        "X-Organization-Id": orgId,
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

    await prisma.organization.create({
      data: {
        id: orgId,
        name: "Org Client Isolation HTTP",
        slug: `org-client-isolation-http-${orgId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const owner = await registerAndLogin(`http-client-iso-owner-${randomUUID()}@smoke.test`);
    const member = await registerAndLogin(`http-client-iso-member-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, member.userId);
    memberToken = member.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: orgId,
        userId: owner.userId,
        role: OrganizationRole.Owner,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: orgId,
        userId: member.userId,
        // BID_MANAGER : permission Tenders large (update, checklist, etc.) mais ne fait PAS partie
        // de OWNER/ORGANIZATION_ADMIN — n'a donc aucun contournement de la vérification client.
        role: OrganizationRole.BidManager,
        occurredAt: new Date(),
      }),
    );

    const clientA = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: "Client A HTTP isolation",
        nameNormalized: "client a http isolation",
        status: "ACTIVE",
        createdBy: owner.userId,
      },
    });
    clientAId = clientA.id;

    const clientB = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: "Client B HTTP isolation",
        nameNormalized: "client b http isolation",
        status: "ACTIVE",
        createdBy: owner.userId,
      },
    });
    clientBId = clientB.id;

    // Le membre BID_MANAGER n'est affecté qu'au Client A — jamais au Client B.
    await prisma.clientAssignment.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        clientAccountId: clientAId,
        userId: member.userId,
        role: "CLIENT_MANAGER",
        createdBy: owner.userId,
      },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderAId,
        organizationId: orgId,
        clientAccountId: clientAId,
        title: "Tender Client A — isolation HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: owner.userId,
      },
    });

    tenderBId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderBId,
        organizationId: orgId,
        clientAccountId: clientBId,
        title: "Tender Client B — isolation HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: owner.userId,
      },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.tenderLot.deleteMany({ where: { tenderId: { in: [tenderAId, tenderBId] } } });
    await prisma.tenderChecklistItem.deleteMany({ where: { tenderId: { in: [tenderAId, tenderBId] } } });
    await prisma.tender.deleteMany({ where: { id: { in: [tenderAId, tenderBId] } } });
    // V2 Sprint 3 — CreateTenderUseCase/CreateTenderLotUseCase écrivent désormais dans l'Outbox
    // (TenderCreated/TenderLotCreated) : à supprimer avant l'organisation, sinon FK violée.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 30000);

  it("PATCH on a Client B tender is rejected with 404 for a member assigned only to Client A", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Titre injecte depuis Client A" }),
    });
    expect(res.status).toBe(404);
  });

  it("PATCH on the Client A tender succeeds for the same member (access not over-restricted)", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderAId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Titre Tender A revise" }),
    });
    expect(res.status).toBe(200);
  });

  it("archiving a Client B tender is rejected with 404", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/archive`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("creating a lot under the Client B tender is rejected with 404", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber: "01", title: "Lot injecte" }),
    });
    expect(res.status).toBe(404);
  });

  it("creating a lot under the Client A tender succeeds for the same member", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderAId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber: "01", title: "Lot Client A" }),
    });
    expect(res.status).toBe(201);
  });

  it("creating a checklist item under the Client B tender is rejected with 404 (previously unverified sub-resource)", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ title: "Item injecte" }),
    });
    expect(res.status).toBe(404);
  });

  it("the Client B tender is untouched after every cross-client attempt", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderBId}`, {
      headers: { Authorization: `Bearer ${memberToken}`, "X-Organization-Id": orgId },
    });
    // Le membre n'a jamais eu accès au Client B, y compris en lecture : 404 également ici.
    expect(res.status).toBe(404);

    const stillOriginal = await prisma.tender.findUniqueOrThrow({ where: { id: tenderBId } });
    expect(stillOriginal.title).toBe("Tender Client B — isolation HTTP");
  });
});
