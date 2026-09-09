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
 * Checkpoint TENDEROS-2.1-CCV2-A — preuve de sécurité bout-en-bout de `CandidatePermission`, réel
 * HTTP + PostgreSQL, sur les CINQ routes de `CandidateCompanyController`.
 *
 * Un SEUL utilisateur par organisation, dont le RÔLE D'ORGANISATION est réécrit en base entre les
 * assertions (`PrismaMembershipRepository.save` est idempotent sur l'id d'appartenance et remplace
 * la ligne `membershipRole`). Ce choix n'est pas un raccourci : `OrganizationMembershipGuard`
 * relit l'appartenance à CHAQUE requête (jamais depuis le jeton), donc le rôle effectivement
 * évalué est bien celui de la base. Il évite en outre de déclencher le bucket partagé
 * `register`+`login` d'`AuthThrottlerGuard` (10 requêtes / 60 s), qui transformerait 8 rôles en
 * 429 sans aucun rapport avec le RBAC testé.
 */
describe("CandidateCompany — RBAC CandidatePermission (CCV2-A), real HTTP + PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let tokenA: string;
  let userA: string;
  let membershipAId: string;
  let tokenB: string;
  let tokenOutsider: string;

  let candidateInA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Candidate RBAC HTTP Test", termsAccepted: true }),
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

  async function setRoleInOrgA(role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<void> {
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(membershipAId), organizationId: orgA, userId: userA, role, occurredAt: new Date() }),
    );
  }

  function headers(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  /** Les 5 routes réellement exposées aujourd'hui par le contrôleur. */
  async function callRoutes(token: string, organizationId: string, candidateCompanyId: string) {
    const h = headers(token, organizationId);
    const list = await fetch(`${baseUrl}/api/v1/candidate-companies`, { headers: h });
    const get = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}`, { headers: h });
    const listEstablishments = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/establishments`, { headers: h });
    const create = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: h, body: JSON.stringify({ name: `RBAC probe ${randomUUID()}` }) });
    const addEstablishment = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/establishments`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ siret: "39395385100010", city: "Lyon", isPrincipal: false }),
    });
    return {
      list: list.status,
      get: get.status,
      listEstablishments: listEstablishments.status,
      create: create.status,
      addEstablishment: addEstablishment.status,
    };
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
    membershipRepository = new PrismaMembershipRepository(prisma);

    await prisma.organization.create({ data: { id: orgA, name: "Candidate RBAC Org A", slug: `candidate-rbac-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "Candidate RBAC Org B", slug: `candidate-rbac-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`candidate-rbac-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`candidate-rbac-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    const outsider = await registerAndLogin(`candidate-rbac-out-${randomUUID()}@smoke.test`);
    userIds.push(outsider.userId);
    tokenOutsider = outsider.token;

    const created = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
      method: "POST",
      headers: headers(tokenA, orgA),
      body: JSON.stringify({ name: `RBAC Base ${randomUUID()}` }),
    });
    candidateInA = ((await created.json()) as { id: string }).id;
  }, 120000);

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
  }, 60000);

  describe("matrice positive — rôles autorisés à muter l'identité candidate", () => {
    it.each([OrganizationRole.Owner, OrganizationRole.OrganizationAdmin, OrganizationRole.BidManager])(
      "%s : lecture ET création/déclaration d'établissement autorisées",
      async (role) => {
        await setRoleInOrgA(role);
        const result = await callRoutes(tokenA, orgA, candidateInA);
        expect(result).toEqual({ list: 200, get: 200, listEstablishments: 200, create: 201, addEstablishment: 201 });
        await prisma.candidateEstablishment.deleteMany({ where: { organizationId: orgA, candidateCompanyId: candidateInA } });
      },
      60000,
    );
  });

  describe("matrice négative — rôles en lecture seule (preuves obligatoires CCV2-A)", () => {
    it.each([OrganizationRole.Contributor, OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly])(
      "%s : lecture autorisée (200) mais toute mutation d'identité refusée en 403, jamais 201",
      async (role) => {
        await setRoleInOrgA(role);
        const result = await callRoutes(tokenA, orgA, candidateInA);
        expect(result.list).toBe(200);
        expect(result.get).toBe(200);
        expect(result.listEstablishments).toBe(200);
        expect(result.create).toBe(403);
        expect(result.addEstablishment).toBe(403);
      },
      60000,
    );

    it("le refus porte le code métier CANDIDATE_PERMISSION_MISSING, jamais une erreur générique", async () => {
      await setRoleInOrgA(OrganizationRole.ReadOnly);
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ name: `Refus ${randomUUID()}` }),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("CANDIDATE_PERMISSION_MISSING");
    }, 60000);

    /** Preuve de comptage : `callRoutes` tente une création pour CHACUN des 8 rôles, donc 8
     *  tentatives au total. Seuls les 3 rôles autorisés (OWNER, ORGANIZATION_ADMIN, BID_MANAGER)
     *  doivent avoir laissé une ligne — les 5 rôles en lecture seule, aucune. Compter 3 et non 0
     *  est ici la bonne assertion : 0 aurait aussi été satisfait par un test qui ne crée rien. */
    it("exactement 3 entreprises candidates créées sur 8 tentatives — une par rôle autorisé, aucune par un rôle en lecture seule", async () => {
      const created = await prisma.candidateCompany.findMany({ where: { organizationId: orgA, name: { startsWith: "RBAC probe" } } });
      expect(created).toHaveLength(3);
    });
  });

  describe("isolation tenant — convention anti-énumération préservée (404, jamais 403)", () => {
    it("un non-membre reçoit 404 ORGANIZATION_ACCESS_DENIED, jamais 403", async () => {
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateInA}`, { headers: headers(tokenOutsider, orgA) });
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("ORGANIZATION_ACCESS_DENIED");
    }, 60000);

    it("un OWNER d'une AUTRE organisation ne voit jamais le candidat d'orgA — 404, jamais 403", async () => {
      // Header de son PROPRE tenant : la permission passe (il est OWNER chez lui), la ressource
      // reste introuvable — un 403 ici trahirait l'existence de la ressource.
      const own = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateInA}`, { headers: headers(tokenB, orgB) });
      expect(own.status).toBe(404);
      expect(((await own.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_COMPANY_NOT_FOUND");

      // En-tête d'organisation FORGÉ vers orgA : rejeté par le guard, jamais par la ressource.
      const forged = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateInA}`, { headers: headers(tokenB, orgA) });
      expect(forged.status).toBe(404);
      expect(((await forged.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");
    }, 60000);

    it("un en-tête d'organisation forgé ne permet jamais une mutation, même à un OWNER", async () => {
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
        method: "POST",
        headers: headers(tokenB, orgA),
        body: JSON.stringify({ name: `Forge ${randomUUID()}` }),
      });
      expect(res.status).toBe(404);
      const leaked = await prisma.candidateCompany.findMany({ where: { organizationId: orgA, name: { startsWith: "Forge " } } });
      expect(leaked).toHaveLength(0);
    }, 60000);
  });
});
