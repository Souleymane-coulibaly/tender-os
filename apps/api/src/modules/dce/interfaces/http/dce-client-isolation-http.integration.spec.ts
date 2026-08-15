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
 * Mission Sprint 8A.2 (audit isolation inter-client, découvert en construisant le module
 * `cockpit`) — avant ce correctif, AUCUN use case DCE ne vérifiait l'affectation client de
 * l'acteur : `GetDceUseCase`/`ListDceDocumentsUseCase`/`GetDceDocumentUseCase`/
 * `DownloadDceDocumentUseCase` n'appelaient jamais `GetTenderUseCase` du tout, et
 * `CreateDceUseCase`/`ImportDceFilesUseCase`/`ReplaceDceDocumentUseCase`/`DeleteDceDocumentUseCase`
 * l'appelaient sans `actorId` (le seul paramètre qui déclenche `AssertClientAccessUseCase` côté
 * `GetTenderUseCase`) — seul le rôle ORG-WIDE (`DcePermission`) était vérifié. Un acteur
 * BID_MANAGER affecté à un seul client pouvait donc lire/importer/modifier/supprimer le DCE de
 * N'IMPORTE QUEL Tender de l'organisation, y compris ceux d'un client auquel il n'est pas
 * affecté. Ce fichier prouve, via HTTP réel + PostgreSQL réel, que ce n'est plus le cas — même
 * motif exact que `tenders-client-isolation-http.integration.spec.ts`.
 */
describe("DCE — isolation HTTP inter-client au sein d'une même organisation (NestJS + PostgreSQL réels)", () => {
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
      body: JSON.stringify({ email, password, displayName: "DCE Client Isolation HTTP Test", termsAccepted: true }),
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
      data: { id: orgId, name: "Org DCE Client Isolation HTTP", slug: `org-dce-client-isolation-http-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const owner = await registerAndLogin(`dce-client-iso-owner-${randomUUID()}@smoke.test`);
    const member = await registerAndLogin(`dce-client-iso-member-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, member.userId);
    memberToken = member.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: orgId,
        userId: member.userId,
        // BID_MANAGER : palier Admin complet côté ROLE_DCE_PERMISSIONS, mais ne fait PAS partie de
        // OWNER/ORGANIZATION_ADMIN — aucun contournement de la vérification client.
        role: OrganizationRole.BidManager,
        occurredAt: new Date(),
      }),
    );

    const clientA = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client A DCE isolation", nameNormalized: "client a dce isolation", status: "ACTIVE", createdBy: owner.userId },
    });
    clientAId = clientA.id;

    const clientB = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Client B DCE isolation", nameNormalized: "client b dce isolation", status: "ACTIVE", createdBy: owner.userId },
    });
    clientBId = clientB.id;

    // Le membre BID_MANAGER n'est affecté qu'au Client A — jamais au Client B.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientAId, userId: member.userId, role: "CLIENT_MANAGER", createdBy: owner.userId },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({ data: { id: tenderAId, organizationId: orgId, clientAccountId: clientAId, title: "Tender Client A — DCE isolation HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });

    tenderBId = randomUUID();
    await prisma.tender.create({ data: { id: tenderBId, organizationId: orgId, clientAccountId: clientBId, title: "Tender Client B — DCE isolation HTTP", status: "DRAFT", tags: [], createdBy: owner.userId } });

    // DCE initialisé côté serveur (OWNER) pour Client B, afin de prouver que le membre ne peut ni
    // le LIRE ni le MODIFIER — jamais seulement l'absence de création.
    await fetch(`${baseUrl}/api/v1/tenders/${tenderBId}/dce`, { method: "POST", headers: { Authorization: `Bearer ${owner.token}`, "X-Organization-Id": orgId } });
  }, 30000);

  afterAll(async () => {
    await prisma.dceDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.dce.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { id: { in: [tenderAId, tenderBId] } } });
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

  it("initializing a DCE for the Client A tender succeeds for the assigned member", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderAId}/dce`, { method: "POST" });
    expect(res.status).toBe(201);
  });

  it("initializing a DCE for the Client B tender is rejected with 404 (never 403 — anti-enumeration)", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/dce`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("GET the Client A DCE succeeds for the assigned member", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderAId}/dce`);
    expect(res.status).toBe(200);
  });

  it("GET the Client B DCE (already initialized by the owner) is rejected with 404 for the member not assigned to Client B", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/dce`);
    expect(res.status).toBe(404);
  });

  it("listing documents on the Client B DCE is rejected with 404", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderBId}/dce/documents`);
    expect(res.status).toBe(404);
  });

  it("importing a document into the Client B DCE is rejected with 404", async () => {
    const form = new FormData();
    form.append("files", new Blob([Buffer.from("%PDF-1.7 fake")], { type: "application/pdf" }), "injected.pdf");
    const res = await asMember(`/api/v1/tenders/${tenderBId}/dce/documents`, { method: "POST", body: form });
    expect(res.status).toBe(404);
  });

  it("listing documents on the Client A DCE succeeds for the assigned member (access not over-restricted)", async () => {
    const res = await asMember(`/api/v1/tenders/${tenderAId}/dce/documents`);
    expect(res.status).toBe(200);
  });
});
