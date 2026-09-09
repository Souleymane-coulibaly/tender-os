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
import { backfillSatellitesToCandidate } from "../../../candidate-company/migration/backfill-satellites-to-candidate";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — preuves HTTP + PostgreSQL réelles des 6 familles de capacités
 * adressées par leur SOT V2.
 *
 * Un seul utilisateur par organisation, dont le rôle d'organisation est réécrit en base entre les
 * assertions (même technique que CCV2-A : `OrganizationMembershipGuard` relit l'appartenance à
 * chaque requête, et cela évite le bucket partagé `register`+`login` d'`AuthThrottlerGuard`).
 */
describe("CCV2-C — capacités CandidateCompany (HTTP + PostgreSQL réels)", () => {
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

  /** Candidat NATIF d'orgA (aucun sourceClientAccountId) — cible principale du CRUD. */
  let candidateA: string;
  /** Second candidat d'orgA — isolation cross-candidate DANS la même organisation. */
  let candidateA2: string;
  /** Candidat d'orgB — isolation cross-tenant. */
  let candidateB: string;
  /** Candidat d'orgA issu du backfill CCV2-B — preuve sur données réellement migrées. */
  let candidateMigrated: string;
  let clientMigrated: string;

  /** Les 6 familles avec un corps VALIDE minimal, repris des schémas Zod Legacy — jamais inventé. */
  const FAMILIES = [
    { path: "representatives", create: { firstName: "Ada", lastName: "Lovelace", type: "SIGNATORY" }, patch: { jobTitle: "Directrice" }, check: (b: Record<string, unknown>) => b.lastName === "Lovelace" },
    { path: "insurances", create: { type: "PROFESSIONAL_LIABILITY", insurer: "AXA" }, patch: { policyNumber: "P-42" }, check: (b: Record<string, unknown>) => b.insurer === "AXA" },
    { path: "certifications", create: { name: "ISO 9001", issuer: "AFNOR" }, patch: { number: "C-42" }, check: (b: Record<string, unknown>) => b.name === "ISO 9001" },
    { path: "references", create: { projectName: "Chantier A" }, patch: { sector: "BTP" }, check: (b: Record<string, unknown>) => b.projectName === "Chantier A" },
    { path: "human-resources", create: { category: "ENG", title: "Ingénieur", headcount: 3 }, patch: { qualification: "Bac+5" }, check: (b: Record<string, unknown>) => b.headcount === 3 },
    { path: "material-resources", create: { category: "ENGIN", name: "Pelleteuse", quantity: 2 }, patch: { location: "Lyon" }, check: (b: Record<string, unknown>) => b.name === "Pelleteuse" },
  ] as const;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-C HTTP", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  async function setRoleInOrgA(role: (typeof OrganizationRole)[keyof typeof OrganizationRole]): Promise<void> {
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(membershipAId), organizationId: orgA, userId: userA, role, occurredAt: new Date() }),
    );
  }

  function headers(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  async function createCandidate(organizationId: string, token: string, name: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/v1/candidate-companies`, { method: "POST", headers: headers(token, organizationId), body: JSON.stringify({ name }) });
    return ((await res.json()) as { id: string }).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);
    membershipRepository = new PrismaMembershipRepository(prisma);

    await prisma.organization.create({ data: { id: orgA, name: "CCV2C A", slug: `ccv2c-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "CCV2C B", slug: `ccv2c-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`ccv2c-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`ccv2c-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    candidateA = await createCandidate(orgA, tokenA, `Candidat Natif ${randomUUID()}`);
    candidateA2 = await createCandidate(orgA, tokenA, `Candidat Voisin ${randomUUID()}`);
    candidateB = await createCandidate(orgB, tokenB, `Candidat B ${randomUUID()}`);

    // --- Jeu de données MIGRÉ (CCV2-B) : un ClientAccount avec ses capacités Legacy, une
    //     CandidateCompany qui en est issue, puis le backfill réel.
    clientMigrated = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientMigrated, organizationId: orgA, name: "Client migré", nameNormalized: `client-migre-${clientMigrated}`, status: "ACTIVE", createdBy: userA },
    });
    candidateMigrated = randomUUID();
    await prisma.candidateCompany.create({
      data: {
        id: candidateMigrated,
        organizationId: orgA,
        name: "Candidat migré",
        nameNormalized: `candidat-migre-${candidateMigrated}`,
        status: "ACTIVE",
        createdBy: userA,
        sourceClientAccountId: clientMigrated,
      },
    });
    await prisma.companyCertification.create({
      data: { organizationId: orgA, clientAccountId: clientMigrated, name: "ISO 14001 héritée", issuer: "AFNOR", createdBy: userA },
    });
    await prisma.companyBankAccount.create({
      data: { organizationId: orgA, clientAccountId: clientMigrated, accountHolder: "Migré SAS", iban: "FR7630006000011234567890189", bic: "AGRIFRPP", createdBy: userA },
    });
    await backfillSatellitesToCandidate(prisma, { organizationId: orgA });
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.companyRepresentative.deleteMany({ where: { organizationId } });
      await prisma.companyBankAccount.deleteMany({ where: { organizationId } });
      await prisma.companyInsurance.deleteMany({ where: { organizationId } });
      await prisma.companyCertification.deleteMany({ where: { organizationId } });
      await prisma.companyReferenceDocument.deleteMany({ where: { organizationId } });
      await prisma.companyReference.deleteMany({ where: { organizationId } });
      await prisma.companyHumanResource.deleteMany({ where: { organizationId } });
      await prisma.companyMaterialResource.deleteMany({ where: { organizationId } });
      await prisma.candidateMigrationRegisterEntry.deleteMany({ where: { organizationId } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId } });
      await prisma.clientAccount.deleteMany({ where: { organizationId } });
      await prisma.auditLog.deleteMany({ where: { organizationId } });
      await prisma.outboxEvent.deleteMany({ where: { organizationId } });
      await prisma.membershipRole.deleteMany({ where: { membership: { organizationId } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await app.close();
  }, 60000);

  describe("CRUD complet des 6 familles sur un candidat NATIF (sans sourceClientAccountId)", () => {
    it.each(FAMILIES)("$path : CREATE → READ → UPDATE → DELETE(archivage)", async (family) => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const base = `${baseUrl}/api/v1/candidate-companies/${candidateA}/${family.path}`;

      const created = await fetch(base, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify(family.create) });
      expect(created.status).toBe(201);
      const createdBody = (await created.json()) as Record<string, unknown>;
      expect(family.check(createdBody)).toBe(true);
      expect(createdBody.candidateCompanyId).toBe(candidateA);
      // Une capacité NÉE candidate-owned n'a aucun propriétaire Legacy — et le lignage n'est
      // jamais exposé dans la réponse.
      expect(createdBody).not.toHaveProperty("clientAccountId");

      const listed = await fetch(base, { headers: headers(tokenA, orgA) });
      expect(listed.status).toBe(200);
      const items = ((await listed.json()) as { items: Record<string, unknown>[] }).items;
      expect(items.map((i) => i.id)).toContain(createdBody.id);

      const patched = await fetch(`${base}/${createdBody.id as string}`, { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify(family.patch) });
      expect(patched.status).toBe(200);
      const patchedBody = (await patched.json()) as Record<string, unknown>;
      for (const [key, value] of Object.entries(family.patch)) {
        expect(patchedBody[key]).toBe(value);
      }

      const archived = await fetch(`${base}/${createdBody.id as string}`, { method: "DELETE", headers: headers(tokenA, orgA) });
      expect(archived.status).toBe(200);
      expect(((await archived.json()) as Record<string, unknown>).status).toBe("ARCHIVED");
    }, 120000);
  });

  describe("RBAC — permissions CCV2-A, aucune nouvelle permission", () => {
    it.each([OrganizationRole.Owner, OrganizationRole.OrganizationAdmin, OrganizationRole.BidManager, OrganizationRole.Contributor])(
      "%s : ALLOW — peut créer une capacité",
      async (role) => {
        await setRoleInOrgA(role);
        const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications`, {
          method: "POST",
          headers: headers(tokenA, orgA),
          body: JSON.stringify({ name: `RBAC allow ${role}` }),
        });
        expect(res.status).toBe(201);
      },
      60000,
    );

    it.each([OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly])(
      "%s : DENY en mutation (403) mais lecture autorisée (200), et ZÉRO écriture en base",
      async (role) => {
        await setRoleInOrgA(role);
        const before = await prisma.companyCertification.count({ where: { organizationId: orgA, candidateCompanyId: candidateA } });

        const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications`, {
          method: "POST",
          headers: headers(tokenA, orgA),
          body: JSON.stringify({ name: `RBAC deny ${role}` }),
        });
        expect(created.status).toBe(403);
        expect(((await created.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_PERMISSION_MISSING");

        const listed = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications`, { headers: headers(tokenA, orgA) });
        expect(listed.status).toBe(200);

        expect(await prisma.companyCertification.count({ where: { organizationId: orgA, candidateCompanyId: candidateA } })).toBe(before);
      },
      60000,
    );
  });

  describe("Isolation cross-candidate et cross-tenant", () => {
    it("une capacité du candidat A2 est invisible et immutable depuis le candidat A — 404, jamais 403", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA2}/certifications`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ name: "Certification du voisin" }),
      });
      const id = ((await created.json()) as { id: string }).id;

      const wrongCandidate = `${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications/${id}`;
      const patched = await fetch(wrongCandidate, { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ number: "PIRATE" }) });
      expect(patched.status).toBe(404);
      const deleted = await fetch(wrongCandidate, { method: "DELETE", headers: headers(tokenA, orgA) });
      expect(deleted.status).toBe(404);

      const listedFromA = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications`, { headers: headers(tokenA, orgA) });
      expect(((await listedFromA.json()) as { items: { id: string }[] }).items.map((i) => i.id)).not.toContain(id);

      // ZERO UNAUTHORIZED WRITE : la ressource du voisin est intacte.
      const row = await prisma.companyCertification.findUnique({ where: { id } });
      expect(row?.number).toBeNull();
      expect(row?.status).toBe("ACTIVE");
      expect(row?.candidateCompanyId).toBe(candidateA2);
    }, 90000);

    it("un OWNER d'orgB ne peut ni lire ni muter les capacités d'orgA — 404, jamais 403", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/insurances`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ type: "DECENNIAL", insurer: "SMABTP" }),
      });
      const id = ((await created.json()) as { id: string }).id;

      // Depuis son PROPRE tenant : le candidat d'orgA n'existe pas pour lui.
      const own = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/insurances`, { headers: headers(tokenB, orgB) });
      expect(own.status).toBe(404);
      expect(((await own.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_COMPANY_NOT_FOUND");

      // En-tête d'organisation FORGÉ vers orgA : rejeté par le guard.
      const forgedList = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/insurances`, { headers: headers(tokenB, orgA) });
      expect(forgedList.status).toBe(404);
      expect(((await forgedList.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");

      const forgedPatch = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/insurances/${id}`, {
        method: "PATCH",
        headers: headers(tokenB, orgA),
        body: JSON.stringify({ insurer: "PIRATE" }),
      });
      expect(forgedPatch.status).toBe(404);
      const forgedDelete = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/insurances/${id}`, { method: "DELETE", headers: headers(tokenB, orgA) });
      expect(forgedDelete.status).toBe(404);

      const row = await prisma.companyInsurance.findUnique({ where: { id } });
      expect(row?.insurer).toBe("SMABTP");
      expect(row?.status).toBe("ACTIVE");
    }, 90000);

    it("rattacher une capacité d'orgA à un candidat d'orgB est impossible via l'API", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateB}/certifications`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ name: "Cross tenant" }),
      });
      expect(res.status).toBe(404);
      expect(await prisma.companyCertification.count({ where: { organizationId: orgA, candidateCompanyId: candidateB } })).toBe(0);
      expect(await prisma.companyCertification.count({ where: { candidateCompanyId: candidateB } })).toBe(0);
    }, 60000);
  });

  describe("LEGACY_DATA — capacités réellement migrées par le backfill CCV2-B", () => {
    it("sont lisibles via la nouvelle API, avec leurs valeurs, sans copie ni changement d'organisation", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/certifications`, { headers: headers(tokenA, orgA) });
      expect(res.status).toBe(200);
      const items = ((await res.json()) as { items: Record<string, unknown>[] }).items;

      const migrated = items.find((i) => i.name === "ISO 14001 héritée");
      expect(migrated).toBeDefined();
      expect(migrated?.issuer).toBe("AFNOR");
      expect(migrated?.candidateCompanyId).toBe(candidateMigrated);

      // AUCUNE duplication : une seule ligne en base porte ce nom, et elle a conservé son lignage
      // Legacy (association, jamais déplacement) et son organisation.
      const rows = await prisma.companyCertification.findMany({ where: { name: "ISO 14001 héritée" } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.clientAccountId).toBe(clientMigrated);
      expect(rows[0]?.organizationId).toBe(orgA);
      expect(rows[0]?.id).toBe(migrated?.id);
    }, 90000);

    it("le chemin Legacy continue de lire la MÊME ligne — aucune divergence possible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const legacy = await prisma.companyCertification.findMany({ where: { organizationId: orgA, clientAccountId: clientMigrated } });
      const v2 = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/certifications`, { headers: headers(tokenA, orgA) });
      const v2Ids = ((await v2.json()) as { items: { id: string }[] }).items.map((i) => i.id).sort();
      expect(legacy.map((r) => r.id).sort()).toEqual(v2Ids);
    }, 60000);
  });

  describe("BANKING_NON_EXPOSURE", () => {
    /** Mis à jour par CCV2-C.1 : la route bancaire EXISTE désormais. L'assertion n'est pas
     *  affaiblie mais renforcée — ce qui compte n'est plus l'absence de route, c'est que le
     *  banking soit derrière une permission DISTINCTE (`candidate:read_banking`) et qu'aucune
     *  réponse de CAPACITÉ n'en laisse fuir la moindre trace. */
    it("le banking vit derrière sa propre permission, et aucune réponse capacité ne contient d'IBAN", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);

      // Un CONTRIBUTOR édite les capacités mais n'atteint jamais le banking.
      await setRoleInOrgA(OrganizationRole.Contributor);
      const denied = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/bank-accounts`, { headers: headers(tokenA, orgA) });
      expect(denied.status).toBe(403);
      expect(await denied.text()).not.toContain("FR7630006000011234567890189");
      await setRoleInOrgA(OrganizationRole.Owner);

      // Le compte bancaire EST bien candidate-owned depuis CCV2-B — mais reste invisible.
      expect(await prisma.companyBankAccount.count({ where: { organizationId: orgA, candidateCompanyId: candidateMigrated } })).toBe(1);

      for (const family of FAMILIES) {
        const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/${family.path}`, { headers: headers(tokenA, orgA) });
        const raw = await res.text();
        expect(raw).not.toContain("FR7630006000011234567890189");
        expect(raw).not.toContain("AGRIFRPP");
        expect(raw.toLowerCase()).not.toContain("iban");
      }
    }, 90000);
  });

  describe("VALIDATION", () => {
    it("refuse un corps incomplet, une valeur invalide, un champ inconnu et un identifiant non-UUID (400, convention ZodValidationPipe)", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const base = `${baseUrl}/api/v1/candidate-companies/${candidateA}/human-resources`;

      // champ requis manquant (`title`)
      expect((await fetch(base, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ category: "ENG", headcount: 1 }) })).status).toBe(400);
      // type invalide
      expect((await fetch(base, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ category: "ENG", title: "X", headcount: "trois" }) })).status).toBe(400);
      // champ inconnu (schémas `.strict()`)
      expect(
        (await fetch(base, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ category: "ENG", title: "X", headcount: 1, pirate: true }) })).status,
      ).toBe(400);
      // identifiant de candidat non-UUID
      expect((await fetch(`${baseUrl}/api/v1/candidate-companies/pas-un-uuid/human-resources`, { headers: headers(tokenA, orgA) })).status).toBe(400);
    }, 90000);
  });

  describe("CONCURRENCE", () => {
    it("double archivage concurrent : jamais de 500, jamais d'état impossible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/material-resources`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ category: "ENGIN", name: "Grue", quantity: 1 }),
      });
      const id = ((await created.json()) as { id: string }).id;
      const url = `${baseUrl}/api/v1/candidate-companies/${candidateA}/material-resources/${id}`;

      const [first, second] = await Promise.all([
        fetch(url, { method: "DELETE", headers: headers(tokenA, orgA) }),
        fetch(url, { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      // L'archivage est idempotent : les deux réussissent, aucune ne peut renvoyer 500.
      expect([first.status, second.status].every((s) => s === 200 || s === 404)).toBe(true);
      expect([first.status, second.status]).not.toContain(500);
      expect((await prisma.companyMaterialResource.findUnique({ where: { id } }))?.status).toBe("ARCHIVED");
    }, 90000);

    it("PATCH concurrent avec DELETE laisse toujours la ligne dans un état valide", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/references`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ projectName: "Concurrence" }),
      });
      const id = ((await created.json()) as { id: string }).id;
      const url = `${baseUrl}/api/v1/candidate-companies/${candidateA}/references/${id}`;

      const [patched, deleted] = await Promise.all([
        fetch(url, { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ sector: "BTP" }) }),
        fetch(url, { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      expect([patched.status, deleted.status]).not.toContain(500);
      const row = await prisma.companyReference.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(["DRAFT", "ARCHIVED"]).toContain(row?.status);
      expect(row?.candidateCompanyId).toBe(candidateA);
    }, 90000);
  });

  describe("AUDIT", () => {
    it("chaque mutation candidate est tracée sur la ressource candidate_company, jamais sur le ClientAccount", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const before = await prisma.auditLog.count({ where: { organizationId: orgA, resourceType: "candidate_company", resourceId: candidateA } });
      const created = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/certifications`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ name: `Audit ${randomUUID()}` }),
      });
      expect(created.status).toBe(201);

      const logs = await prisma.auditLog.findMany({ where: { organizationId: orgA, resourceType: "candidate_company", resourceId: candidateA }, orderBy: { createdAt: "desc" } });
      expect(logs.length).toBe(before + 1);
      expect(logs[0]?.action).toBe("candidate_company.certification_added");
    }, 60000);
  });
});
