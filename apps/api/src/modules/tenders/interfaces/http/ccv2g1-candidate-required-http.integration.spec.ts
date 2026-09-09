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
 * Checkpoint TENDEROS-2.1-CCV2-G.1 — POLICY A « hard require candidate », sur HTTP + PostgreSQL
 * réels.
 *
 * Ce que ces preuves établissent, et qui conditionne CCV2-G.2 : à partir de maintenant, TOUT Tender
 * nouvellement créé porte une entreprise candidate EXPLICITEMENT choisie. C'est le seul état qui
 * rend sûr le retrait des replis `CompanyProfile` — sans lui, supprimer le repli laisserait les
 * Tenders neufs sans aucune identité candidate.
 *
 * Deux sentinelles antagonistes vérifient qu'aucun mécanisme ne recopie l'identité du CLIENT
 * commercial dans celle du candidat (§22).
 */
describe("CCV2-G.1 — entreprise candidate obligatoire à la création (HTTP + PostgreSQL réels)", () => {
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

  let clientAId: string;
  let candidateA: string;
  let candidateB: string;
  let legacyTenderId: string;

  const LEGACY_SENTINEL = "LEGACY-CLIENT-SECRET";
  const NATIVE_SENTINEL = "NATIVE-CANDIDATE-A";

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-G1", termsAccepted: true }),
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

  async function createTender(body: Record<string, unknown>, token = tokenA, organizationId = orgA): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/tenders`, { method: "POST", headers: headers(token, organizationId), body: JSON.stringify(body) });
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

    await prisma.organization.create({ data: { id: orgA, name: "G1 A", slug: `g1-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "G1 B", slug: `g1-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`g1-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`g1-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientAId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientAId, organizationId: orgA, name: `G1 client ${randomUUID()}`, nameNormalized: `g1 client ${randomUUID()}`, status: "ACTIVE", createdBy: userA },
    });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientAId, userId: userA, role: "CLIENT_MANAGER", createdBy: userA },
    });
    // Sentinelle LEGACY : profil COMMERCIAL du client, complet et reconnaissable.
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId: orgA,
        clientAccountId: clientAId,
        legalName: `${LEGACY_SENTINEL} SAS`,
        tradeName: LEGACY_SENTINEL,
        siren: "552100554",
        createdBy: userA,
      },
    });

    const candA = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
      method: "POST",
      headers: headers(tokenA, orgA),
      body: JSON.stringify({ name: `${NATIVE_SENTINEL} ${randomUUID()}` }),
    });
    candidateA = ((await candA.json()) as { id: string }).id;

    const candB = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
      method: "POST",
      headers: headers(tokenB, orgB),
      body: JSON.stringify({ name: `G1 B ${randomUUID()}` }),
    });
    candidateB = ((await candB.json()) as { id: string }).id;

    // Tender HISTORIQUE sans candidat, inséré DIRECTEMENT en persistance : c'est exactement l'état
    // que POLICY A doit laisser intact, et qu'aucune règle de création ne doit pouvoir produire.
    legacyTenderId = randomUUID();
    await prisma.tender.create({
      data: { id: legacyTenderId, organizationId: orgA, clientAccountId: clientAId, title: "G1 legacy", status: "DRAFT", tags: [], createdBy: userA },
    });
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.tenderStatusHistoryEntry.deleteMany({ where: { organizationId } });
      await prisma.tender.deleteMany({ where: { organizationId } });
      await prisma.candidateEstablishment.deleteMany({ where: { organizationId } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId } });
      await prisma.companyLegalIdentity.deleteMany({ where: { organizationId } });
      await prisma.clientAssignment.deleteMany({ where: { organizationId } });
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

  describe("§18 — contrat de création", () => {
    it("crée le Tender quand une entreprise candidate accessible est désignée", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await createTender({ clientAccountId: clientAId, candidateCompanyId: candidateA, title: `G1 nominal ${randomUUID()}` });
      expect(res.status).toBe(201);

      const created = (await res.json()) as { id: string; candidateCompanyId?: string };
      expect(created.candidateCompanyId).toBe(candidateA);
      expect((await prisma.tender.findUnique({ where: { id: created.id } }))?.candidateCompanyId).toBe(candidateA);
    }, 240000);

    it("refuse explicitement la création sans entreprise candidate — jamais un 500, jamais un Tender écrit", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const before = await prisma.tender.count({ where: { organizationId: orgA } });

      const res = await createTender({ clientAccountId: clientAId, title: "G1 sans candidat" });
      // 400 `VALIDATION_FAILED` : le schéma Zod est la PREMIÈRE barrière. Le corps ne nomme
      // volontairement AUCUN champ — convention produit du `ZodValidationPipe`, qui évite de
      // révéler la forme interne des requêtes. Ce qui est prouvé ici est donc le refus, jamais un
      // libellé.
      //
      // La seconde barrière, indépendante, est `CandidateCompanyRequiredError` (422
      // `CANDIDATE_COMPANY_REQUIRED`) levée par `CreateTenderUseCase` : elle protège les appelants
      // INTERNES qui ne passent pas par HTTP — c'est elle qui bloque la promotion d'une Opportunity
      // sans candidat (prouvé dans `promote-opportunity-to-tender.use-case.spec.ts`).
      expect(res.status).toBe(400);
      expect(await res.text()).toContain("VALIDATION_FAILED");

      expect(await prisma.tender.count({ where: { organizationId: orgA } })).toBe(before);
    }, 240000);

    it("refuse une entreprise candidate d'une AUTRE organisation — 404, sans rien révéler d'elle", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const before = await prisma.tender.count({ where: { organizationId: orgA } });

      const res = await createTender({ clientAccountId: clientAId, candidateCompanyId: candidateB, title: "G1 candidat etranger" });
      expect(res.status).toBe(404);
      const body = await res.text();
      expect(body).toContain("CANDIDATE_COMPANY_NOT_FOUND");
      expect(body).not.toContain("G1 B");

      expect(await prisma.tender.count({ where: { organizationId: orgA } })).toBe(before);
    }, 240000);

    it("refuse un identifiant inventé et une entreprise candidate ARCHIVÉE", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      expect((await createTender({ clientAccountId: clientAId, candidateCompanyId: randomUUID(), title: "G1 invente" })).status).toBe(404);

      const archived = await fetch(`${baseUrl}/api/v1/candidate-companies`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ name: `G1 archivee ${randomUUID()}` }),
      });
      const archivedId = ((await archived.json()) as { id: string }).id;
      await prisma.candidateCompany.update({ where: { id: archivedId }, data: { status: "ARCHIVED", archivedAt: new Date() } });

      const res = await createTender({ clientAccountId: clientAId, candidateCompanyId: archivedId, title: "G1 archivee" });
      expect(res.status).toBe(409);
      expect(await res.text()).toContain("CANDIDATE_COMPANY_ARCHIVED");
    }, 240000);
  });

  describe("§22 — sentinelle hostile : rien ne recopie l'identité du client dans le candidat", () => {
    it("le Tender créé porte l'identité CANDIDATE, jamais celle du client commercial", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const res = await createTender({ clientAccountId: clientAId, candidateCompanyId: candidateA, title: `G1 sentinelle ${randomUUID()}` });
      expect(res.status).toBe(201);
      const created = (await res.json()) as { id: string };

      const candidate = await prisma.candidateCompany.findUniqueOrThrow({ where: { id: candidateA } });
      expect(candidate.name).toContain(NATIVE_SENTINEL);
      // Aucun champ de l'entreprise candidate ne porte la sentinelle du client.
      expect(JSON.stringify(candidate).split(LEGACY_SENTINEL).length - 1, "LEGACY_SENTINEL_COUNT").toBe(0);
      // Ni sa provenance : le Tender n'a pas fabriqué de lien vers le ClientAccount.
      expect(candidate.sourceClientAccountId).toBeNull();

      const tender = await prisma.tender.findUniqueOrThrow({ where: { id: created.id } });
      expect(tender.candidateCompanyId).toBe(candidateA);
    }, 240000);
  });

  describe("§12 — aucun backfill automatique des Tenders historiques", () => {
    it("le Tender sans candidat reste NULL : aucune règle de création ne le remplit rétroactivement", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      // On crée plusieurs Tenders conformes ; si un mécanisme de rattrapage existait, il toucherait
      // le Tender historique au passage.
      for (let index = 0; index < 2; index += 1) {
        expect((await createTender({ clientAccountId: clientAId, candidateCompanyId: candidateA, title: `G1 boucle ${randomUUID()}` })).status).toBe(201);
      }

      const legacy = await prisma.tender.findUniqueOrThrow({ where: { id: legacyTenderId } });
      expect(legacy.candidateCompanyId, "AUTO_BACKFILL_COUNT").toBeNull();
      expect(legacy.status).toBe("DRAFT");
    }, 240000);
  });

  describe("§14/§15 — transition explicite d'un Tender historique", () => {
    it("un rôle autorisé assigne l'entreprise candidate par le contrat OFFICIEL, avec audit et événement", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);

      const res = await fetch(`${baseUrl}/api/v1/tenders/${legacyTenderId}/candidate-company`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ candidateCompanyId: candidateA, reason: "Transition CCV2-G.1" }),
      });
      expect(res.status).toBe(200);

      expect((await prisma.tender.findUniqueOrThrow({ where: { id: legacyTenderId } })).candidateCompanyId).toBe(candidateA);

      // Le chemin emprunté est bien `ChangeTenderCandidateCompanyUseCase` (certifié en F.2) et non
      // un second mécanisme d'assignation : seul lui produit ces deux traces.
      const audit = await prisma.auditLog.findFirst({
        where: { organizationId: orgA, resourceId: legacyTenderId, action: "tender.candidate_company_changed" },
      });
      expect(audit).not.toBeNull();
      const outbox = await prisma.outboxEvent.count({
        where: { organizationId: orgA, aggregateId: legacyTenderId, eventType: "TenderCandidateCompanyChanged" },
      });
      expect(outbox).toBeGreaterThan(0);
    }, 240000);

    it.each(["CONTRIBUTOR", "READ_ONLY", "EXTERNAL_CONSULTANT"])(
      "%s : assignation refusée en requête forcée, le Tender reste inchangé",
      async (role) => {
        // On repart d'un Tender historique neuf pour que « inchangé » veuille dire NULL.
        const freshLegacyId = randomUUID();
        await prisma.tender.create({
          data: { id: freshLegacyId, organizationId: orgA, clientAccountId: clientAId, title: `G1 legacy ${role}`, status: "DRAFT", tags: [], createdBy: userA },
        });

        await setRoleInOrgA(role as (typeof OrganizationRole)[keyof typeof OrganizationRole]);
        const res = await fetch(`${baseUrl}/api/v1/tenders/${freshLegacyId}/candidate-company`, {
          method: "POST",
          headers: headers(tokenA, orgA),
          body: JSON.stringify({ candidateCompanyId: candidateA }),
        });
        expect(res.status).toBe(403);
        expect((await prisma.tender.findUniqueOrThrow({ where: { id: freshLegacyId } })).candidateCompanyId).toBeNull();
      },
      240000,
    );

    it.each(["CONTRIBUTOR", "READ_ONLY", "EXTERNAL_CONSULTANT"])("%s : création de Tender refusée elle aussi", async (role) => {
      await setRoleInOrgA(role as (typeof OrganizationRole)[keyof typeof OrganizationRole]);
      const res = await createTender({ clientAccountId: clientAId, candidateCompanyId: candidateA, title: `G1 refus ${role}` });
      expect(res.status).toBe(403);
    }, 240000);
  });
});
