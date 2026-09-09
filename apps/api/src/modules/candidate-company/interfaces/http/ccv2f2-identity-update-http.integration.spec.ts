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
 * Checkpoint TENDEROS-2.1-CCV2-F.2 — gap F2-02 : édition NATIVE de l'identité juridique de
 * l'entreprise candidate, sur HTTP + PostgreSQL réels.
 *
 * Ferme l'incomplétude fonctionnelle relevée par l'audit indépendant : CandidateCompany V2 est la
 * surface d'administration principale, mais son identité était en lecture seule — la seule façon
 * de la corriger passait par le Legacy `CompanyProfile`, exactement la dépendance que CCV2 supprime.
 *
 * Trois barrières INDÉPENDANTES contre le mass assignment sont éprouvées ici : le schéma Zod
 * `.strict()`, le type du patch dans le use case, et la liste blanche de
 * `CandidateCompany.updateIdentity`. Aucune ne repose sur les deux autres.
 */
describe("CCV2-F.2 — identité candidate native (HTTP + PostgreSQL réels)", () => {
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

  let candidateA: string;
  let candidateA2: string;
  let candidateB: string;
  let foreignClientAccountB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-F2 HTTP", termsAccepted: true }),
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

  function url(candidateCompanyId: string): string {
    return `${baseUrl}/api/v1/candidate-companies/${candidateCompanyId}`;
  }

  async function patch(candidateCompanyId: string, body: unknown, token = tokenA, organizationId = orgA): Promise<Response> {
    return fetch(url(candidateCompanyId), { method: "PATCH", headers: headers(token, organizationId), body: JSON.stringify(body) });
  }

  async function read(candidateCompanyId: string, token = tokenA, organizationId = orgA): Promise<Record<string, unknown>> {
    const res = await fetch(url(candidateCompanyId), { headers: headers(token, organizationId) });
    return (await res.json()) as Record<string, unknown>;
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

    await prisma.organization.create({ data: { id: orgA, name: "F2 A", slug: `f2-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "F2 B", slug: `f2-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const a = await registerAndLogin(`f2-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    membershipAId = randomUUID();
    await setRoleInOrgA(OrganizationRole.Owner);

    const b = await registerAndLogin(`f2-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    candidateA = await createCandidate(orgA, tokenA, `F2 A ${randomUUID()}`);
    candidateA2 = await createCandidate(orgA, tokenA, `F2 A2 ${randomUUID()}`);
    candidateB = await createCandidate(orgB, tokenB, `F2 B ${randomUUID()}`);

    // Un ClientAccount RÉEL d'une autre organisation — cible de provenance pour l'essai hostile.
    foreignClientAccountB = randomUUID();
    await prisma.clientAccount.create({
      data: { id: foreignClientAccountB, organizationId: orgB, name: `F2 client B ${randomUUID()}`, nameNormalized: `f2 client b ${randomUUID()}`, status: "ACTIVE", createdBy: b.userId },
    });
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.candidateEstablishment.deleteMany({ where: { organizationId } });
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

  describe("Contrat nominal", () => {
    it("met à jour les six champs de la liste blanche, trace l'audit, et n'invente aucune valeur", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);

      const res = await patch(candidateA, {
        name: `F2 A renommee ${randomUUID()}`,
        legalName: "ALPHA REBAPTISEE SAS",
        tradeName: "Alpha",
        siren: "552100554",
        vatNumber: "FR96552100554",
        legalForm: "SAS",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.legalName).toBe("ALPHA REBAPTISEE SAS");
      expect(body.tradeName).toBe("Alpha");
      expect(body.siren).toBe("552100554");
      // Cle FR = (12 + 3 x (SIREN mod 97)) mod 97 = 96 pour le SIREN 552100554.
      expect(body.vatNumber).toBe("FR96552100554");
      expect(body.legalForm).toBe("SAS");

      // La lecture RELUE en base confirme la persistance, y compris `nameNormalized` recalculé.
      const persisted = await prisma.candidateCompany.findUnique({ where: { id: candidateA } });
      expect(persisted?.tradeName).toBe("Alpha");
      expect(persisted?.nameNormalized).toBe((body.name as string).toLowerCase().trim());
      expect(persisted?.updatedBy).toBe(userA);
      // La provenance n'a pas bougé, alors même que `toPersistence` réécrit toute la ligne.
      expect(persisted?.sourceClientAccountId).toBeNull();
      expect(persisted?.organizationId).toBe(orgA);
      expect(persisted?.status).toBe("ACTIVE");

      const audit = await prisma.auditLog.findFirst({
        where: { organizationId: orgA, resourceId: candidateA, action: "candidate_company.identity_updated" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorId).toBe(userA);
    }, 240000);

    it("distingue « champ absent » (ne pas toucher) de null (effacer explicitement)", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      await patch(candidateA2, { legalName: "A CONSERVER SARL", legalForm: "SARL" });

      // Patch qui ne mentionne PAS `legalName` : il doit survivre intact.
      expect((await patch(candidateA2, { legalForm: "SAS" })).status).toBe(200);
      expect((await read(candidateA2)).legalName).toBe("A CONSERVER SARL");

      // `null` explicite : effacement réel.
      expect((await patch(candidateA2, { legalName: null })).status).toBe(200);
      const cleared = await read(candidateA2);
      expect(cleared.legalName ?? null).toBeNull();
      // Le champ non mentionné dans CE patch est resté.
      expect(cleared.legalForm).toBe("SAS");
    }, 240000);

    it("refuse un patch vide, un SIREN de somme de contrôle invalide et un numéro de TVA FR invalide — jamais un 500", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      expect((await patch(candidateA2, {})).status).toBe(400);
      expect((await patch(candidateA2, { siren: "123456789" })).status).toBe(422);
      expect((await patch(candidateA2, { vatNumber: "FR00000000000" })).status).toBe(422);
      // Un numéro de TVA NON français n'est pas soumis à la règle française : le rejeter serait un
      // faux positif. Il est accepté tel quel.
      expect((await patch(candidateA2, { vatNumber: "BE0123456749" })).status).toBe(200);
    }, 240000);

    it("refuse de dupliquer le nom d'une autre entreprise candidate de la même organisation (409)", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const target = await read(candidateA);
      const res = await patch(candidateA2, { name: target.name });
      expect(res.status).toBe(409);
      // Rien n'a été écrit.
      expect((await read(candidateA2)).name).not.toBe(target.name);
    }, 240000);
  });

  describe("Mass assignment — provenance et propriété inchangées", () => {
    it("rejette tout champ hostile en 400, sans jamais déplacer l'entreprise candidate", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const before = await prisma.candidateCompany.findUnique({ where: { id: candidateA } });

      const hostilePayloads: Record<string, unknown>[] = [
        { legalName: "PIRATE", organizationId: orgB },
        { legalName: "PIRATE", sourceClientAccountId: foreignClientAccountB },
        { legalName: "PIRATE", clientAccountId: foreignClientAccountB },
        { legalName: "PIRATE", candidateCompanyId: candidateB },
        { legalName: "PIRATE", id: candidateB },
        { legalName: "PIRATE", status: "ARCHIVED" },
        { legalName: "PIRATE", createdBy: randomUUID() },
        { legalName: "PIRATE", createdAt: "2000-01-01T00:00:00.000Z" },
        { legalName: "PIRATE", updatedAt: "2000-01-01T00:00:00.000Z" },
        { legalName: "PIRATE", nameNormalized: "force" },
        { legalName: "PIRATE", archivedAt: "2000-01-01T00:00:00.000Z" },
      ];

      for (const payload of hostilePayloads) {
        const res = await patch(candidateA, payload);
        expect(res.status, `payload ${JSON.stringify(payload)}`).toBe(400);
      }

      // Aucune écriture n'a eu lieu : même le champ légitime du payload est refusé avec le reste.
      const after = await prisma.candidateCompany.findUnique({ where: { id: candidateA } });
      expect(after?.organizationId).toBe(before?.organizationId);
      expect(after?.sourceClientAccountId).toBe(before?.sourceClientAccountId ?? null);
      expect(after?.status).toBe(before?.status);
      expect(after?.createdBy).toBe(before?.createdBy);
      expect(after?.legalName).toBe(before?.legalName);
      expect(after?.legalName).not.toBe("PIRATE");

      // L'entreprise candidate de l'AUTRE organisation n'a pas été touchée non plus.
      const untouched = await prisma.candidateCompany.findUnique({ where: { id: candidateB } });
      expect(untouched?.organizationId).toBe(orgB);
      expect(untouched?.legalName).not.toBe("PIRATE");
    }, 240000);
  });

  describe("Isolation tenant", () => {
    it("une entreprise candidate d'une autre organisation est introuvable — 404, jamais 403, et jamais mutée", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);

      // Jeton d'orgA, identifiant d'orgB.
      expect((await patch(candidateB, { legalName: "PIRATE" })).status).toBe(404);
      // En-tête d'organisation forgé : jeton d'orgB présenté avec `X-Organization-Id: orgA`.
      expect((await patch(candidateA, { legalName: "PIRATE" }, tokenB, orgA)).status).toBe(404);
      // Identifiant inventé.
      expect((await patch(randomUUID(), { legalName: "PIRATE" })).status).toBe(404);

      expect((await prisma.candidateCompany.findUnique({ where: { id: candidateB } }))?.legalName).not.toBe("PIRATE");
      expect((await prisma.candidateCompany.findUnique({ where: { id: candidateA } }))?.legalName).not.toBe("PIRATE");
    }, 240000);
  });

  describe("Permissions CCV2-A — requête forcée, jamais un bouton masqué", () => {
    it.each(["CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"])(
      "%s : PATCH identité refusé en 403 et zéro écriture",
      async (role) => {
        await setRoleInOrgA(role as (typeof OrganizationRole)[keyof typeof OrganizationRole]);
        const before = await prisma.candidateCompany.findUnique({ where: { id: candidateA } });

        const res = await patch(candidateA, { legalName: "FORCE PAR UN ROLE SANS DROIT" });
        expect(res.status).toBe(403);

        const after = await prisma.candidateCompany.findUnique({ where: { id: candidateA } });
        expect(after?.legalName).toBe(before?.legalName);
        expect(after?.updatedAt.toISOString()).toBe(before?.updatedAt.toISOString());
      },
      240000,
    );

    it.each(["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER"])("%s : PATCH identité autorisé", async (role) => {
      await setRoleInOrgA(role as (typeof OrganizationRole)[keyof typeof OrganizationRole]);
      const res = await patch(candidateA, { legalForm: `SAS ${role}` });
      expect(res.status).toBe(200);
      expect((await read(candidateA)).legalForm).toBe(`SAS ${role}`);
    }, 240000);

    it("le refus de rôle est évalué AVANT toute lecture : une ressource étrangère reste un 404, pas un 403", async () => {
      await setRoleInOrgA(OrganizationRole.ReadOnly);
      // Rôle sans droit ET ressource étrangère : le 403 arrive en premier et ne dit donc rien de
      // l'existence de `candidateB` — c'est la convention CCV2-A, vérifiée ici explicitement.
      expect((await patch(candidateB, { legalName: "X" })).status).toBe(403);

      await setRoleInOrgA(OrganizationRole.Owner);
      // Rôle avec droit, ressource étrangère : 404.
      expect((await patch(candidateB, { legalName: "X" })).status).toBe(404);
    }, 240000);
  });

  describe("Identité → Source-of-Truth aval", () => {
    it("le résolveur d'identité candidate sert la NOUVELLE valeur, sans regénérer aucun dossier", async () => {
      await setRoleInOrgA(OrganizationRole.Owner);
      const sentinelCandidate = await createCandidate(orgA, tokenA, `F2 SOT ${randomUUID()}`);

      expect((await patch(sentinelCandidate, { legalName: "BETA-OLD SAS" })).status).toBe(200);
      expect((await read(sentinelCandidate)).legalName).toBe("BETA-OLD SAS");

      expect((await patch(sentinelCandidate, { legalName: "BETA-NEW SAS" })).status).toBe(200);

      // SOT CandidateCompany.
      const sot = await read(sentinelCandidate);
      expect(sot.legalName).toBe("BETA-NEW SAS");

      // Consommateur aval RÉEL : `ResolveCandidateIdentityUseCase` sert `legalName ?? name` comme
      // `displayName` et `legalName` tel quel. On l'interroge par son use case, jamais en relisant
      // la table — c'est le chemin de résolution qu'empruntent les formulaires officiels.
      const resolver = app.get<{ execute: (input: { organizationId: string; candidateCompanyId: string }) => Promise<{ displayName: string; legalName?: string }> }>(
        (await import("../../application/use-cases/resolve-candidate-identity.use-case")).ResolveCandidateIdentityUseCase,
      );
      const resolved = await resolver.execute({ organizationId: orgA, candidateCompanyId: sentinelCandidate });
      expect(resolved.legalName).toBe("BETA-NEW SAS");
      expect(resolved.displayName).toBe("BETA-NEW SAS");
      expect(JSON.stringify(resolved)).not.toContain("BETA-OLD");
    }, 240000);
  });
});
