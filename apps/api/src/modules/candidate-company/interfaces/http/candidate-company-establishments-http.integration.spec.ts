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
 * Checkpoint 2.1-A6.4 (DEFERRED-BE-04) — preuve bout-en-bout de
 * `GET /candidate-companies/:candidateCompanyId/establishments`, réel HTTP + PostgreSQL. Le
 * contrôleur `CandidateCompanyController` n'avait jusqu'ici aucune couverture HTTP du tout (unique
 * couverture à l'unité) — ce fichier couvre spécifiquement le nouvel endpoint de listing (mission
 * §66 "TEST DIRECT ID / IDOR" exige une preuve réelle, pas seulement unitaire, pour l'isolation
 * cross-organisation).
 */
describe("CandidateCompany establishments — listing endpoint, real HTTP + PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let tokenOrgA: string;
  let tokenOrgB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Candidate Establishments HTTP Test", termsAccepted: true }),
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
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgA, name: "Candidate Establishments Org A", slug: `candidate-est-org-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "Candidate Establishments Org B", slug: `candidate-est-org-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const ownerA = await registerAndLogin(`candidate-est-owner-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId);
    tokenOrgA = ownerA.token;
    await addMembership({ organizationId: orgA, userId: ownerA.userId, role: OrganizationRole.Owner });

    const ownerB = await registerAndLogin(`candidate-est-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerB.userId);
    tokenOrgB = ownerB.token;
    await addMembership({ organizationId: orgB, userId: ownerB.userId, role: OrganizationRole.Owner });
  }, 60000);

  afterAll(async () => {
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgA, orgB] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgA, orgB] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await app.close();
  }, 30000);

  it("lists both establishments of a CandidateCompany, principal first, and returns [] for a CandidateCompany with none yet", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: authHeaders(tokenOrgA, orgA), body: JSON.stringify({ name: "Alpha Services" }) });
    const alpha = (await createRes.json()) as { id: string };

    const emptyRes = await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, { headers: authHeaders(tokenOrgA, orgA) });
    expect(emptyRes.status).toBe(200);
    expect((await emptyRes.json()) as { items: unknown[] }).toEqual({ items: [] });

    await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, {
      method: "POST",
      headers: authHeaders(tokenOrgA, orgA),
      body: JSON.stringify({ siret: "39395385100010", city: "Lyon", isPrincipal: false }),
    });
    await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, {
      method: "POST",
      headers: authHeaders(tokenOrgA, orgA),
      body: JSON.stringify({ siret: "35600000000048", city: "Paris", isPrincipal: true }),
    });

    const listRes = await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, { headers: authHeaders(tokenOrgA, orgA) });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { items: { city: string; isPrincipal: boolean }[] };
    expect(body.items.map((e) => e.city)).toEqual(["Paris", "Lyon"]);
    expect(body.items[0]?.isPrincipal).toBe(true);
  });

  it("BLOQUANT (mission §19/§66, IDOR) — Org B can never list Org A's establishments via a real, valid candidateCompanyId — 404, never a data leak", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: authHeaders(tokenOrgA, orgA), body: JSON.stringify({ name: "Alpha Cross-Org Target" }) });
    const alpha = (await createRes.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, {
      method: "POST",
      headers: authHeaders(tokenOrgA, orgA),
      body: JSON.stringify({ siret: "78900000000029", city: "Paris" }),
    });

    const crossOrgRes = await fetch(`${baseUrl}/api/v1/candidate-companies/${alpha.id}/establishments`, { headers: authHeaders(tokenOrgB, orgB) });
    expect(crossOrgRes.status).toBe(404);
  });

  it("returns 404 for a candidateCompanyId that does not exist at all, same shape as the cross-org case", async () => {
    const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${randomUUID()}/establishments`, { headers: authHeaders(tokenOrgA, orgA) });
    expect(res.status).toBe(404);
  });
});
