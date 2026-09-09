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
 * Checkpoint TENDEROS-2.1-CCV2-C.1 — preuves HTTP + PostgreSQL réelles du banking candidate.
 *
 * L'IBAN sentinelle n'apparaît QUE dans ce fichier : chaque preuve de non-exposition le cherche
 * littéralement dans la réponse brute, ce qui rend impossible un faux positif dû à une
 * sérialisation partielle.
 */
describe("CCV2-C.1 — banking CandidateCompany (HTTP + PostgreSQL réels)", () => {
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

  let candidateA1: string;
  let candidateA2: string;
  let candidateB1: string;
  let candidateMigrated: string;
  let clientMigrated: string;

  /** IBAN réels et valides (ISO 13616), pays différents pour prouver le multi-pays. */
  const IBAN_A1 = "FR7630006000011234567890189";
  const IBAN_A2 = "DE89370400440532013000";
  const IBAN_MIGRATED = "GB82WEST12345698765432";
  const BIC_A1 = "AGRIFRPP";

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-C.1 HTTP", termsAccepted: true }),
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

  function bankUrl(candidateCompanyId: string, bankAccountId?: string): string {
    return `${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}/bank-accounts${bankAccountId ? `/${bankAccountId}` : ""}`;
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

    await prisma.organization.create({ data: { id: orgA, name: "C1 A", slug: `c1-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "C1 B", slug: `c1-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`c1-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`c1-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    candidateA1 = await createCandidate(orgA, tokenA, `A1 ${randomUUID()}`);
    candidateA2 = await createCandidate(orgA, tokenA, `A2 ${randomUUID()}`);
    candidateB1 = await createCandidate(orgB, tokenB, `B1 ${randomUUID()}`);

    // Jeu MIGRÉ CCV2-B : compte bancaire Legacy puis backfill réel.
    clientMigrated = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientMigrated, organizationId: orgA, name: "Client migré", nameNormalized: `cm-${clientMigrated}`, status: "ACTIVE", createdBy: userA },
    });
    candidateMigrated = randomUUID();
    await prisma.candidateCompany.create({
      data: { id: candidateMigrated, organizationId: orgA, name: "Candidat migré", nameNormalized: `cand-${candidateMigrated}`, status: "ACTIVE", createdBy: userA, sourceClientAccountId: clientMigrated },
    });
    await prisma.companyBankAccount.create({
      data: { organizationId: orgA, clientAccountId: clientMigrated, accountHolder: "Migré SAS", iban: IBAN_MIGRATED, bic: "WESTGB2L", isPrimary: true, createdBy: userA },
    });
    await backfillSatellitesToCandidate(prisma, { organizationId: orgA });
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.companyBankAccount.deleteMany({ where: { organizationId } });
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

  describe("CRUD et politique de réponse", () => {
    it("CREATE → READ → UPDATE → DELETE(archivage), IBAN TOUJOURS masqué en réponse", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);

      const created = await fetch(bankUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: "A1 SAS", iban: "FR76 3000 6000 0112 3456 7890 189", bic: "agrifrpp", isPrimary: true }),
      });
      expect(created.status).toBe(201);
      const createdRaw = await created.clone().text();
      const body = (await created.json()) as Record<string, unknown>;

      // Politique : masqué même sur la réponse de création.
      expect(createdRaw).not.toContain(IBAN_A1);
      expect(body.iban).toBe(`${"•".repeat(IBAN_A1.length - 4)}0189`);
      expect(body).not.toHaveProperty("clientAccountId");
      expect(body.candidateCompanyId).toBe(candidateA1);

      // Normalisation réelle en base : espaces retirés, casse remontée.
      const stored = await prisma.companyBankAccount.findUnique({ where: { id: body.id as string } });
      expect(stored?.iban).toBe(IBAN_A1);
      expect(stored?.bic).toBe(BIC_A1);
      expect(stored?.clientAccountId).toBeNull();

      const listed = await fetch(bankUrl(candidateA1), { headers: headers(tokenA, orgA) });
      expect(listed.status).toBe(200);
      expect(await listed.clone().text()).not.toContain(IBAN_A1);

      const patched = await fetch(bankUrl(candidateA1, body.id as string), {
        method: "PATCH",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ bankName: "Crédit Agricole" }),
      });
      expect(patched.status).toBe(200);
      expect(await patched.clone().text()).not.toContain(IBAN_A1);

      const archived = await fetch(bankUrl(candidateA1, body.id as string), { method: "DELETE", headers: headers(tokenA, orgA) });
      expect(archived.status).toBe(200);
      const archivedBody = (await archived.json()) as Record<string, unknown>;
      expect(archivedBody.status).toBe("ARCHIVED");
      expect(archivedBody.isPrimary).toBe(false);
      // Archivage logique : la ligne existe toujours.
      expect(await prisma.companyBankAccount.findUnique({ where: { id: body.id as string } })).not.toBeNull();
    }, 120000);
  });

  describe("BANKING_NON_EXPOSURE — exigence P0", () => {
    it("aucun DTO générique CandidateCompany ne contient d'IBAN/BIC", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const surfaces = [
        `${baseUrl}/api/v1/candidate-companies`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/establishments`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/certifications`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/representatives`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/insurances`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/references`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/human-resources`,
        `${baseUrl}/api/v1/candidate-companies/${candidateMigrated}/material-resources`,
      ];
      for (const url of surfaces) {
        const res = await fetch(url, { headers: headers(tokenA, orgA) });
        expect(res.status).toBe(200);
        const raw = await res.text();
        expect(raw).not.toContain(IBAN_MIGRATED);
        expect(raw).not.toContain("WESTGB2L");
        expect(raw.toLowerCase()).not.toContain("iban");
        expect(raw.toLowerCase()).not.toContain("\"bic\"");
      }
    }, 120000);

    it("candidate:read ne suffit JAMAIS : un CONTRIBUTOR lit la fiche mais reçoit 403 sur le banking", async () => {
      await setRoleInOrgA(OrganizationRole.Contributor);
      const fiche = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateMigrated}`, { headers: headers(tokenA, orgA) });
      expect(fiche.status).toBe(200);

      const banking = await fetch(bankUrl(candidateMigrated), { headers: headers(tokenA, orgA) });
      expect(banking.status).toBe(403);
      const raw = await banking.text();
      expect(raw).not.toContain(IBAN_MIGRATED);
      expect(JSON.parse(raw).error.code).toBe("CANDIDATE_PERMISSION_MISSING");
    }, 60000);
  });

  describe("RBAC runtime — matrice complète, zéro écriture non autorisée", () => {
    it.each([OrganizationRole.Owner, OrganizationRole.OrganizationAdmin, OrganizationRole.BidManager])("%s : read ET manage autorisés", async (role) => {
      await setRoleInOrgA(role);
      expect((await fetch(bankUrl(candidateA2), { headers: headers(tokenA, orgA) })).status).toBe(200);

      const created = await fetch(bankUrl(candidateA2), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: `Holder ${role}`, iban: IBAN_A2 }),
      });
      expect(created.status).toBe(201);
      const id = ((await created.json()) as { id: string }).id;

      expect((await fetch(bankUrl(candidateA2, id), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ bankName: "X" }) })).status).toBe(200);
      expect((await fetch(bankUrl(candidateA2, id), { method: "DELETE", headers: headers(tokenA, orgA) })).status).toBe(200);
    }, 120000);

    it.each([OrganizationRole.Contributor, OrganizationRole.Reviewer, OrganizationRole.Executive, OrganizationRole.ExternalConsultant, OrganizationRole.ReadOnly])(
      "%s : read 403, create/update/delete 403, et ZÉRO écriture en base",
      async (role) => {
        await setRoleInOrgA(OrganizationRole.Owner);
        const seeded = await fetch(bankUrl(candidateA1), {
          method: "POST",
          headers: headers(tokenA, orgA),
          body: JSON.stringify({ accountHolder: "Cible", iban: IBAN_A2 }),
        });
        const id = ((await seeded.json()) as { id: string }).id;
        const before = await prisma.companyBankAccount.findUnique({ where: { id } });

        await setRoleInOrgA(role);
        for (const attempt of [
          fetch(bankUrl(candidateA1), { headers: headers(tokenA, orgA) }),
          fetch(bankUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "Pirate", iban: IBAN_A1 }) }),
          fetch(bankUrl(candidateA1, id), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "Pirate" }) }),
          fetch(bankUrl(candidateA1, id), { method: "DELETE", headers: headers(tokenA, orgA) }),
        ]) {
          const res = await attempt;
          expect(res.status).toBe(403);
          expect(((await res.json()) as { error: { code: string } }).error.code).toBe("CANDIDATE_PERMISSION_MISSING");
        }

        const after = await prisma.companyBankAccount.findUnique({ where: { id } });
        expect(after).toEqual(before);
        expect(await prisma.companyBankAccount.count({ where: { organizationId: orgA, accountHolder: "Pirate" } })).toBe(0);

        await setRoleInOrgA(OrganizationRole.Owner);
        await prisma.companyBankAccount.delete({ where: { id } });
      },
      120000,
    );
  });

  describe("Isolation tenant, cross-candidate, en-tête forgé et mass assignment", () => {
    it("un compte de A1 est inaccessible depuis A2 et depuis orgB — 404, jamais 403, et jamais muté", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(bankUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: "Isolé", iban: IBAN_A2 }),
      });
      const id = ((await created.json()) as { id: string }).id;

      // Même organisation, AUTRE candidat.
      for (const res of [
        await fetch(bankUrl(candidateA2, id), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "Pirate" }) }),
        await fetch(bankUrl(candidateA2, id), { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]) {
        expect(res.status).toBe(404);
      }
      const listedFromA2 = await fetch(bankUrl(candidateA2), { headers: headers(tokenA, orgA) });
      expect(((await listedFromA2.json()) as { items: { id: string }[] }).items.map((i) => i.id)).not.toContain(id);

      // Autre organisation — depuis son propre tenant, puis avec en-tête FORGÉ.
      expect((await fetch(bankUrl(candidateA1), { headers: headers(tokenB, orgB) })).status).toBe(404);
      const forged = await fetch(bankUrl(candidateA1), { headers: headers(tokenB, orgA) });
      expect(forged.status).toBe(404);
      expect(((await forged.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");
      expect((await fetch(bankUrl(candidateA1, id), { method: "DELETE", headers: headers(tokenB, orgA) })).status).toBe(404);

      const row = await prisma.companyBankAccount.findUnique({ where: { id } });
      expect(row?.accountHolder).toBe("Isolé");
      expect(row?.status).toBe("ACTIVE");
      expect(row?.candidateCompanyId).toBe(candidateA1);

      await prisma.companyBankAccount.delete({ where: { id } });
    }, 120000);

    it("mass assignment : organizationId et candidateCompanyId du corps sont ignorés ou refusés", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await fetch(bankUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: "Mass", iban: IBAN_A2, organizationId: orgB, candidateCompanyId: candidateB1, clientAccountId: clientMigrated }),
      });
      // Les schémas sont `.strict()` : un champ inconnu est rejeté, jamais silencieusement absorbé.
      expect(res.status).toBe(400);
      expect(await prisma.companyBankAccount.count({ where: { accountHolder: "Mass" } })).toBe(0);
    }, 60000);

    it("candidat inexistant et compte inexistant renvoient 404, jamais 403", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      expect((await fetch(bankUrl(randomUUID()), { headers: headers(tokenA, orgA) })).status).toBe(404);
      expect((await fetch(bankUrl(candidateA1, randomUUID()), { method: "DELETE", headers: headers(tokenA, orgA) })).status).toBe(404);
    }, 60000);
  });

  describe("VALIDATION IBAN/BIC", () => {
    it("refuse un IBAN à clé fausse, un BIC malformé, un corps vide et un champ trop long", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const post = (body: unknown) => fetch(bankUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify(body) });

      const badIban = await post({ accountHolder: "X", iban: "FR7630006000011234567890188" });
      expect(badIban.status).toBe(422);
      expect(((await badIban.json()) as { error: { code: string; message: string } }).error.code).toBe("INVALID_IBAN");

      const badBic = await post({ accountHolder: "X", iban: IBAN_A2, bic: "AGRI1RPP" });
      expect(badBic.status).toBe(422);
      expect(((await badBic.json()) as { error: { code: string } }).error.code).toBe("INVALID_BIC");

      expect((await post({})).status).toBe(400);
      expect((await post({ accountHolder: "X".repeat(241), iban: IBAN_A2 })).status).toBe(400);
      expect((await post({ accountHolder: "X", iban: "X".repeat(35) })).status).toBe(400);

      expect(await prisma.companyBankAccount.count({ where: { organizationId: orgA, accountHolder: "X" } })).toBe(0);
    }, 90000);

    it("le message d'erreur ne répète jamais l'IBAN fourni", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await fetch(bankUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: "X", iban: "FR7630006000011234567890188" }),
      });
      expect(await res.text()).not.toContain("FR7630006000011234567890188");
    }, 60000);
  });

  describe("COMPTE PRINCIPAL — invariant et concurrence", () => {
    it("promouvoir un compte rétrograde l'autre : jamais deux comptes principaux", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const first = ((await (await fetch(bankUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "P1", iban: IBAN_A1, isPrimary: true }) })).json()) as { id: string }).id;
      const second = ((await (await fetch(bankUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "P2", iban: IBAN_A2, isPrimary: true }) })).json()) as { id: string }).id;

      expect(await prisma.companyBankAccount.count({ where: { candidateCompanyId: candidateA2, isPrimary: true } })).toBe(1);
      expect((await prisma.companyBankAccount.findUnique({ where: { id: second } }))?.isPrimary).toBe(true);
      expect((await prisma.companyBankAccount.findUnique({ where: { id: first } }))?.isPrimary).toBe(false);

      const promoted = await fetch(bankUrl(candidateA2, first), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ isPrimary: true }) });
      expect(promoted.status).toBe(200);
      expect(await prisma.companyBankAccount.count({ where: { candidateCompanyId: candidateA2, isPrimary: true } })).toBe(1);

      await prisma.companyBankAccount.deleteMany({ where: { candidateCompanyId: candidateA2 } });
    }, 120000);

    it("deux promotions CONCURRENTES ne produisent jamais deux comptes principaux ni de 500 brut", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const a = ((await (await fetch(bankUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "C1", iban: IBAN_A1 }) })).json()) as { id: string }).id;
      const b = ((await (await fetch(bankUrl(candidateA2), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "C2", iban: IBAN_A2 }) })).json()) as { id: string }).id;

      const [r1, r2] = await Promise.all([
        fetch(bankUrl(candidateA2, a), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ isPrimary: true }) }),
        fetch(bankUrl(candidateA2, b), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ isPrimary: true }) }),
      ]);

      // Le perdant de la course reçoit un CONFLIT explicite (409), jamais un 500 brut.
      expect([r1.status, r2.status]).not.toContain(500);
      expect([r1.status, r2.status].every((s) => s === 200 || s === 409)).toBe(true);
      const primaries = await prisma.companyBankAccount.count({ where: { candidateCompanyId: candidateA2, isPrimary: true } });
      expect(primaries).toBeLessThanOrEqual(1);

      await prisma.companyBankAccount.deleteMany({ where: { candidateCompanyId: candidateA2 } });
    }, 120000);

    it("double DELETE et PATCH vs DELETE concurrents : aucun 500, aucun état impossible", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const id = ((await (await fetch(bankUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "Conc", iban: IBAN_A2 }) })).json()) as { id: string }).id;

      const [d1, d2] = await Promise.all([
        fetch(bankUrl(candidateA1, id), { method: "DELETE", headers: headers(tokenA, orgA) }),
        fetch(bankUrl(candidateA1, id), { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      expect([d1.status, d2.status]).not.toContain(500);
      expect((await prisma.companyBankAccount.findUnique({ where: { id } }))?.status).toBe("ARCHIVED");

      const id2 = ((await (await fetch(bankUrl(candidateA1), { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({ accountHolder: "Conc2", iban: IBAN_A1 }) })).json()) as { id: string }).id;
      const [p, d] = await Promise.all([
        fetch(bankUrl(candidateA1, id2), { method: "PATCH", headers: headers(tokenA, orgA), body: JSON.stringify({ bankName: "Y" }) }),
        fetch(bankUrl(candidateA1, id2), { method: "DELETE", headers: headers(tokenA, orgA) }),
      ]);
      expect([p.status, d.status]).not.toContain(500);
      const row = await prisma.companyBankAccount.findUnique({ where: { id: id2 } });
      expect(["ACTIVE", "ARCHIVED"]).toContain(row?.status);
      expect(row?.candidateCompanyId).toBe(candidateA1);

      await prisma.companyBankAccount.deleteMany({ where: { candidateCompanyId: candidateA1 } });
    }, 120000);
  });

  describe("LEGACY — données du backfill CCV2-B", () => {
    it("le compte migré appartient au bon candidat, conserve ses valeurs, n'est ni dupliqué ni perdu", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await fetch(bankUrl(candidateMigrated), { headers: headers(tokenA, orgA) });
      expect(res.status).toBe(200);
      const items = ((await res.json()) as { items: Record<string, unknown>[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0]?.accountHolder).toBe("Migré SAS");
      expect(items[0]?.iban).toBe(`${"•".repeat(IBAN_MIGRATED.length - 4)}5432`);

      const rows = await prisma.companyBankAccount.findMany({ where: { iban: IBAN_MIGRATED } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.candidateCompanyId).toBe(candidateMigrated);
      // ASSOCIATION, jamais déplacement : le lignage Legacy est intact.
      expect(rows[0]?.clientAccountId).toBe(clientMigrated);
      expect(rows[0]?.organizationId).toBe(orgA);
    }, 90000);

    it("aucun fallback silencieux : un candidat sans compte renvoie une liste VIDE, jamais le banking du ClientAccount", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      // Candidat créé POUR cette preuve : réutiliser un candidat d'un autre test laisserait des
      // comptes archivés (l'archivage ne supprime jamais la ligne) et rendrait l'assertion fausse.
      const vierge = await createCandidate(orgA, tokenA, `Vierge ${randomUUID()}`);
      const res = await fetch(bankUrl(vierge), { headers: headers(tokenA, orgA) });
      expect(res.status).toBe(200);
      const raw = await res.text();
      expect(JSON.parse(raw).items).toEqual([]);
      expect(raw).not.toContain(IBAN_MIGRATED);
    }, 60000);
  });

  describe("AUDIT & LOG SAFETY", () => {
    it("l'audit trace la mutation sans jamais contenir l'IBAN complet ni le BIC", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const created = await fetch(bankUrl(candidateA1), {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ accountHolder: "Audit", iban: IBAN_A1, bic: BIC_A1 }),
      });
      const id = ((await created.json()) as { id: string }).id;
      await fetch(bankUrl(candidateA1, id), { method: "DELETE", headers: headers(tokenA, orgA) });

      const logs = await prisma.auditLog.findMany({ where: { organizationId: orgA, resourceType: "candidate_company", resourceId: candidateA1 }, orderBy: { createdAt: "asc" } });
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("candidate_company.bank_account_added");
      expect(actions).toContain("candidate_company.bank_account_archived");

      const serialized = JSON.stringify(logs);
      expect(serialized).not.toContain(IBAN_A1);
      expect(serialized).not.toContain(BIC_A1);
      expect(serialized).toContain("0189"); // seule empreinte autorisée : les 4 derniers caractères
      // Aucune trace bancaire ne doit non plus partir dans l'Outbox.
      expect(JSON.stringify(await prisma.outboxEvent.findMany({ where: { organizationId: orgA } }))).not.toContain(IBAN_A1);

      await prisma.companyBankAccount.deleteMany({ where: { candidateCompanyId: candidateA1 } });
    }, 120000);
  });
});
