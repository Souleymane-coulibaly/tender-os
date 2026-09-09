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
import { CreateCompanyRepresentativeUseCase, UpdateCompanyRepresentativeUseCase } from "../../application/use-cases/company-representative.use-cases";
import { ClientBidderWriteRetiredError } from "../../domain/errors";

/**
 * Checkpoint TENDEROS-2.1-H.1 — L'AUTORISATION PRÉCÈDE LA VALIDATION MÉTIER.
 *
 * Constat fermé ici (`P2-I-FINAL-AUTHORIZATION-ORDER`) : les deux cas d'usage de contact CRM
 * évaluaient la nature du représentant (autorité juridique ou contact commercial) AVANT de vérifier
 * l'accès au client. Un acteur sans aucun droit sur un client recevait donc `409` au lieu de `404`
 * dès que sa charge utile portait un type juridique.
 *
 * POURQUOI C'EST UN DÉFAUT ET PAS UN DÉTAIL : la différence entre les deux réponses transforme le
 * produit en ORACLE. En variant uniquement la validité métier de sa charge utile, un acteur non
 * autorisé apprend comment le produit aurait traité sa requête — et obtient une réponse de fond
 * d'un système qui aurait dû se contenter de l'ignorer. L'ordre correct est invariable :
 * authentification, puis tenant, puis accès à la ressource, puis RBAC, et seulement ensuite la règle
 * métier.
 *
 * DISTINCTION EXPLICITE (mission §11) : l'analyse syntaxique de la requête (JSON malformé, schéma
 * Zod) peut légitimement échouer avant l'autorisation — c'est la frontière du transport, elle ne
 * porte sur aucune donnée protégée. Le défaut fermé ici concerne la validation MÉTIER d'une
 * ressource protégée. Les preuves ci-dessous utilisent donc des charges utiles syntaxiquement
 * VALIDES, dont seule la sémantique diffère.
 */
describe("H.1 — ordre autorisation / validation métier sur les contacts CRM (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  /** Affecté au SEUL client A. Le modèle d'accès étant à deux paliers, un OWNER traverserait
   *  légitimement les affectations et ne prouverait donc rien sur le cloisonnement. */
  let scopedToken: string;
  let scopedId: string;
  /** Affecté au client A en lecture seule : sert la preuve RBAC. */
  let viewerToken: string;
  let viewerId: string;
  let ownerId: string;
  let foreignToken: string;
  let foreignId: string;

  let clientA: string;
  let clientB: string;
  let orgBClient: string;
  let contactInB: string;
  let contactInA: string;
  /** Cas d'usage resolus depuis le conteneur REEL : la preuve d'ordonnancement se joue sous la
   *  couche HTTP, la ou le schema Zod ne peut plus masquer le comportement. */
  let createUseCase: CreateCompanyRepresentativeUseCase;
  let updateUseCase: UpdateCompanyRepresentativeUseCase;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "H1", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  function headers(token: string, organizationId = orgA): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  /** Charge utile syntaxiquement valide, sémantiquement ACCEPTABLE si l'acteur était autorisé. */
  const VALID_CRM_CONTACT = { firstName: "Claire", lastName: "Martin", type: "COMMERCIAL_CONTACT" } as const;
  /** Charge utile syntaxiquement valide, sémantiquement REFUSÉE si l'acteur était autorisé :
   *  `SIGNATORY` porte une autorité juridique et appartient à l'entreprise candidate. */
  const LEGAL_AUTHORITY_CONTACT = { firstName: "Grace", lastName: "Hopper", type: "SIGNATORY" } as const;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
    prisma = moduleRef.get(PrismaService);
    createUseCase = moduleRef.get(CreateCompanyRepresentativeUseCase);
    updateUseCase = moduleRef.get(UpdateCompanyRepresentativeUseCase);
    const memberships = new PrismaMembershipRepository(prisma);

    for (const [id, label] of [
      [orgA, "A"],
      [orgB, "B"],
    ] as const) {
      await prisma.organization.create({ data: { id, name: `H1 ${label}`, slug: `h1-${label}-${id}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    }

    const owner = await registerAndLogin(`h1-owner-${randomUUID()}@smoke.test`);
    const scoped = await registerAndLogin(`h1-scoped-${randomUUID()}@smoke.test`);
    const viewer = await registerAndLogin(`h1-viewer-${randomUUID()}@smoke.test`);
    const foreign = await registerAndLogin(`h1-foreign-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, scoped.userId, viewer.userId, foreign.userId);
    ownerId = owner.userId;
    scopedToken = scoped.token;
    scopedId = scoped.userId;
    viewerToken = viewer.token;
    viewerId = viewer.userId;
    foreignToken = foreign.token;
    foreignId = foreign.userId;

    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    for (const userId of [scopedId, viewerId]) {
      await memberships.save(
        OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
      );
    }
    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: foreignId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientA = randomUUID();
    clientB = randomUUID();
    orgBClient = randomUUID();
    for (const [id, org, label] of [
      [clientA, orgA, "A"],
      [clientB, orgA, "B"],
      [orgBClient, orgB, "orgB"],
    ] as const) {
      await prisma.clientAccount.create({
        data: { id, organizationId: org, name: `H1 client ${label} ${id}`, nameNormalized: `h1 client ${label} ${id}`, status: "ACTIVE", createdBy: org === orgA ? ownerId : foreignId },
      });
    }
    // Affectations sur le SEUL client A.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientA, userId: scopedId, role: "CLIENT_MANAGER", createdBy: ownerId },
    });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientA, userId: viewerId, role: "VIEWER", createdBy: ownerId },
    });

    contactInA = randomUUID();
    contactInB = randomUUID();
    await prisma.companyRepresentative.createMany({
      data: [
        { id: contactInA, organizationId: orgA, clientAccountId: clientA, firstName: "Contact", lastName: "ClientA", type: "COMMERCIAL_CONTACT", status: "ACTIVE", createdBy: ownerId },
        { id: contactInB, organizationId: orgA, clientAccountId: clientB, firstName: "Contact", lastName: "ClientB", type: "COMMERCIAL_CONTACT", status: "ACTIVE", createdBy: ownerId },
      ],
    });
  }, 300000);

  afterAll(async () => {
    for (const org of [orgA, orgB]) {
      await prisma.companyRepresentative.deleteMany({ where: { organizationId: org } });
      await prisma.clientAssignment.deleteMany({ where: { organizationId: org } });
      await prisma.clientAccount.deleteMany({ where: { organizationId: org } });
      await prisma.auditLog.deleteMany({ where: { organizationId: org } });
      await prisma.outboxEvent.deleteMany({ where: { organizationId: org } });
      await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: org } } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: org } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await app.close();
  }, 180000);

  describe("§19 — l'oracle de validation métier est fermé", () => {
    it("CAS D'USAGE — un acteur non autorisé reçoit le refus d'ACCÈS, jamais le refus métier", async () => {
      // LA preuve du checkpoint, et elle se joue ici plutôt qu'en HTTP : au niveau du cas d'usage,
      // aucun schéma ne s'interpose, donc l'ordre réel des gardes est directement observable.
      //
      // Avant H.1, cet appel levait `ClientBidderWriteRetiredError` — une réponse de FOND servie à
      // un acteur sans le moindre droit sur ce client. Il doit désormais échouer sur l'ACCÈS.
      let raised: unknown;
      try {
        await createUseCase.execute({
          organizationId: orgA,
          clientAccountId: clientB,
          actorId: scopedId,
          actorRole: "CONTRIBUTOR",
          firstName: "Grace",
          lastName: "Hopper",
          type: "SIGNATORY",
        });
      } catch (error) {
        raised = error;
      }

      expect(raised, "l'appel doit échouer").toBeDefined();
      expect(raised, "le refus métier ne doit jamais précéder le refus d'accès").not.toBeInstanceOf(ClientBidderWriteRetiredError);
      expect(await prisma.companyRepresentative.count({ where: { clientAccountId: clientB } })).toBe(1);
    }, 300000);

    it("CAS D'USAGE — même invariant sur la mise à jour", async () => {
      let raised: unknown;
      try {
        await updateUseCase.execute({
          organizationId: orgA,
          clientAccountId: clientB,
          representativeId: contactInB,
          actorId: scopedId,
          actorRole: "CONTRIBUTOR",
          patch: { type: "SIGNATORY" },
        });
      } catch (error) {
        raised = error;
      }

      expect(raised).toBeDefined();
      expect(raised).not.toBeInstanceOf(ClientBidderWriteRetiredError);
      expect((await prisma.companyRepresentative.findUnique({ where: { id: contactInB } }))?.type).toBe("COMMERCIAL_CONTACT");
    }, 300000);

    it("CAS D'USAGE — contre-preuve : pour qui EST autorisé, la règle métier s'applique toujours", async () => {
      // Sans cette contre-preuve, déplacer la garde puis la neutraliser produirait exactement le
      // même résultat vert sur les deux tests précédents.
      await expect(
        createUseCase.execute({
          organizationId: orgA,
          clientAccountId: clientA,
          actorId: scopedId,
          actorRole: "CONTRIBUTOR",
          firstName: "Grace",
          lastName: "Hopper",
          type: "SIGNATORY",
        }),
      ).rejects.toBeInstanceOf(ClientBidderWriteRetiredError);

      expect(await prisma.companyRepresentative.count({ where: { clientAccountId: clientA, type: "SIGNATORY" } })).toBe(0);
    }, 300000);

    it("HTTP — le rejet d'un type juridique est une frontière de TRANSPORT, indépendante de l'autorisation", async () => {
      // Mission §11 — distinction à établir explicitement plutôt qu'à supposer.
      //
      // Sur la route CRM, `SIGNATORY` n'appartient pas au contrat de requête : le schéma le rejette
      // en 400 avant tout traitement. Ce statut n'est donc PAS un oracle sur l'autorisation — c'est
      // une propriété STATIQUE de l'API, identique pour un acteur autorisé et pour un acteur qui ne
      // l'est pas. C'est précisément ce que ce test vérifie : les deux obtiennent le même 400.
      const unauthorized = await fetch(`${baseUrl}/api/v1/clients/${clientB}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify(LEGAL_AUTHORITY_CONTACT),
      });
      const authorized = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify(LEGAL_AUTHORITY_CONTACT),
      });

      expect(unauthorized.status).toBe(400);
      expect(authorized.status, "même verdict des deux côtés : aucune information sur l'accès").toBe(400);
    }, 300000);

    it("HTTP — pour deux charges utiles ACCEPTÉES par le contrat, l'acteur non autorisé obtient le même verdict", async () => {
      // Les deux charges franchissent le schéma ; seule leur validité métier éventuelle diffère.
      // C'est le couple qui testerait un oracle de VALIDATION MÉTIER par-dessus HTTP.
      const first = await fetch(`${baseUrl}/api/v1/clients/${clientB}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify(VALID_CRM_CONTACT),
      });
      const second = await fetch(`${baseUrl}/api/v1/clients/${clientB}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify({ ...VALID_CRM_CONTACT, email: "claire@client.test", jobTitle: "Acheteuse" }),
      });

      expect(second.status).toBe(first.status);
      expect([403, 404]).toContain(first.status);
      expect(await prisma.companyRepresentative.count({ where: { clientAccountId: clientB } })).toBe(1);
    }, 300000);
  });

  describe("§12 — cloisonnement inter-clients de la MÊME organisation", () => {
    it("un contact du client B n'est pas modifiable par la route du client A", async () => {
      // L'autorisation porte sur le client de la ROUTE ; l'identifiant fourni appartient à un autre
      // client. Sans vérification de propriété de la cible, l'acteur serait autorisé sur A et
      // muterait une ressource de B — la régression P0 corrigée à l'audit Codex, transposée ici.
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives/${contactInB}`, {
        method: "PATCH",
        headers: headers(scopedToken),
        body: JSON.stringify({ jobTitle: "Injecté depuis A" }),
      });
      expect(res.status).toBe(404);

      const untouched = await prisma.companyRepresentative.findUnique({ where: { id: contactInB } });
      expect(untouched?.jobTitle ?? null, "le contact du client B est intact").toBeNull();
    }, 300000);

    it("le même acteur gère parfaitement le contact de SON client — le refus est un cloisonnement, pas une permission manquante", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives/${contactInA}`, {
        method: "PATCH",
        headers: headers(scopedToken),
        body: JSON.stringify({ jobTitle: "Responsable achats" }),
      });
      expect(res.status).toBe(200);
      expect((await prisma.companyRepresentative.findUnique({ where: { id: contactInA } }))?.jobTitle).toBe("Responsable achats");
    }, 300000);
  });

  describe("§13 — cloisonnement inter-organisations", () => {
    it("un acteur d'une autre organisation ne peut ni créer ni découvrir", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(foreignToken, orgB),
        body: JSON.stringify(VALID_CRM_CONTACT),
      });
      expect(res.status).toBe(404);
      expect(await prisma.companyRepresentative.count({ where: { clientAccountId: clientA } })).toBe(1);
    }, 300000);
  });

  describe("§9/§10 — protections relocalisées en I.4, toujours actives", () => {
    it("VIEWER : lecture autorisée, mutation refusée", async () => {
      const read = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, { headers: headers(viewerToken) });
      expect(read.status).toBe(200);

      const write = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(viewerToken),
        body: JSON.stringify(VALID_CRM_CONTACT),
      });
      expect(write.status).toBe(403);
    }, 300000);

    it("anti-mass-assignment : un champ inconnu est rejeté au schéma, jamais ignoré en silence", async () => {
      // Frontière de TRANSPORT (mission §11) : ce rejet précède l'autorisation et c'est légitime —
      // il ne porte sur aucune donnée protégée, seulement sur la forme de la requête.
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify({ ...VALID_CRM_CONTACT, organizationId: randomUUID() }),
      });
      expect(res.status).toBe(400);
    }, 300000);
  });

  describe("§15 — les écritures de candidature restent retirées", () => {
    it("un acteur AUTORISÉ ne peut toujours pas créer un signataire sur la surface client", async () => {
      // Contre-preuve du correctif : déplacer la garde après l'autorisation ne doit pas la
      // désactiver. Pour qui est autorisé, le refus métier s'applique exactement comme avant.
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify(LEGAL_AUTHORITY_CONTACT),
      });
      expect([400, 409]).toContain(res.status);
      expect(await prisma.companyRepresentative.count({ where: { clientAccountId: clientA, type: "SIGNATORY" } })).toBe(0);
    }, 300000);

    it("un contact CRM légitime reste parfaitement créable — la surface est recentrée, pas fermée", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/representatives`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify({ firstName: "Nadia", lastName: "Bernard", type: "TECHNICAL_CONTACT", email: "nadia@client.test" }),
      });
      expect(res.status).toBe(201);
      const created = (await res.json()) as { id: string; type: string };
      expect(created.type).toBe("TECHNICAL_CONTACT");
      expect((await prisma.companyRepresentative.findUnique({ where: { id: created.id } }))?.candidateCompanyId).toBeNull();
    }, 300000);
  });
});
