import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
// Accès direct au repository Prisma de Memberships réservé à ce test : il n'existe aucune API
// publique pour créer la toute première Membership ADMIN d'une organisation sans passer par une
// Membership déjà active (OrganizationMembershipGuard l'exige) — même contournement que les
// scripts de smoke test manuels utilisés pendant l'implémentation des modules Documents et Lots.
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";

/**
 * AUDIT-004 — preuve réelle de l'isolation multi-tenant : boot d'une véritable application
 * NestJS (guards, pipes, filtres d'erreurs, use cases, Prisma réel) plutôt qu'un test de
 * contrôleur avec des cas d'usage simulés (qui ne prouverait rien sur l'autorisation réelle).
 */
describe("Tender Lots — isolation HTTP inter-tenant (NestJS + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];
  let tokenA: string;
  let tokenB: string;
  let tenderAId: string;
  let lotAId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "HTTP Isolation Test" }),
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
        id: orgAId,
        name: "Org A HTTP Isolation",
        slug: `org-a-http-isolation-${orgAId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.organization.create({
      data: {
        id: orgBId,
        name: "Org B HTTP Isolation",
        slug: `org-b-http-isolation-${orgBId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const userA = await registerAndLogin(`http-lots-a-${randomUUID()}@smoke.test`);
    const userB = await registerAndLogin(`http-lots-b-${randomUUID()}@smoke.test`);
    userIds.push(userA.userId, userB.userId);
    tokenA = userA.token;
    tokenB = userB.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: orgAId,
        userId: userA.userId,
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: orgBId,
        userId: userB.userId,
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );

    const clientAccountA = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        name: "Client de test",
        nameNormalized: "client de test",
        status: "ACTIVE",
        createdBy: userA.userId,
      },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderAId,
        organizationId: orgAId,
        clientAccountId: clientAccountA.id,
        title: "Tender A — isolation HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: userA.userId,
      },
    });

    const created = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/lots`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgAId },
      body: JSON.stringify({ lotNumber: "01", title: "Lot A" }),
    });
    lotAId = ((await created.json()) as { id: string }).id;
  }, 30000);

  afterAll(async () => {
    await prisma.tenderLot.deleteMany({ where: { tenderId: tenderAId } });
    await prisma.tender.deleteMany({ where: { id: tenderAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  function asB(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
        "X-Organization-Id": orgBId,
        ...init?.headers,
      },
    });
  }

  it("GET rejects cross-tenant access with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots/${lotAId}`);
    expect(res.status).toBe(404);
  });

  it("PATCH rejects a cross-tenant update with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots/${lotAId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Titre injecte" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE rejects a cross-tenant deletion with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots/${lotAId}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("RESTORE rejects a cross-tenant restoration with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots/${lotAId}/restore`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("REORDER rejects a cross-tenant tender id with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ lotIds: [lotAId] }),
    });
    expect(res.status).toBe(404);
  });

  it("CREATE rejects creating a lot under a foreign tender id with 404", async () => {
    const res = await asB(`/api/v1/tenders/${tenderAId}/lots`, {
      method: "POST",
      body: JSON.stringify({ lotNumber: "99", title: "Lot injecte" }),
    });
    expect(res.status).toBe(404);
  });

  it("the original lot is untouched after every cross-tenant attempt", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/lots/${lotAId}`, {
      headers: { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgAId },
    });
    const body = (await res.json()) as { title: string };
    expect(res.status).toBe(200);
    expect(body.title).toBe("Lot A");
  });
});
