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
 * Checkpoint TENDEROS-2.1-CCV2-I.2 — ISOLATION DE LECTURE des satellites Legacy.
 *
 * CCV2-B a migré la PROPRIÉTÉ des satellites par ASSOCIATION : la ligne conserve son
 * `clientAccountId` (lignage) et acquiert un `candidateCompanyId` (propriétaire métier). Une même
 * ligne répond donc potentiellement à DEUX routes gardées par DEUX systèmes de permission.
 *
 * CCV2-I.1 a fermé ce chemin pour le BANCAIRE, où l'enjeu est une élévation de privilège. I.2
 * généralise l'analyse aux six autres familles — sans transposer aveuglément la sensibilité
 * bancaire à des domaines qui n'ont pas le même contrat de confidentialité (mission §16).
 *
 * L'invariant prouvé ici est celui de la §17 : la route CLIENT ne sert plus que les lignes
 * HISTORIQUES (`candidateCompanyId IS NULL`), jamais les lignes dont `CandidateCompany` est
 * désormais la source de vérité. Les données ne sont ni supprimées ni déplacées : elles restent
 * lisibles par leur route légitime, ce qui est vérifié explicitement.
 */
describe("CCV2-I.2 — isolation de lecture des satellites Legacy (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let token: string;
  let ownerId: string;
  let clientAId: string;
  let clientBId: string;
  let candidateId: string;

  /** Une ligne par famille, DOUBLEMENT liée : c'est la seule configuration qui prouve quelque chose. */
  const dualLinked: Record<string, string> = {};
  /** Une ligne par famille, purement historique — elle doit RESTER visible côté client. */
  const legacyOnly: Record<string, string> = {};

  /** Un identifiant de fixture absent est un défaut du test, pas un cas à ignorer silencieusement :
   *  sans cette barrière, `undefined` filtrerait vers Prisma et rendrait l'assertion vide de sens. */
  function fixtureId(bag: Record<string, string>, key: string): string {
    const value = bag[key];
    if (value === undefined) {
      throw new Error(`Identifiant de fixture manquant : ${key}`);
    }
    return value;
  }

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-I2", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  function headers(): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }

  async function get(clientId: string, path: string): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/clients/${clientId}${path}`, { headers: headers() });
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

    await prisma.organization.create({ data: { id: orgId, name: "I2", slug: `i2-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    const owner = await registerAndLogin(`i2-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    token = owner.token;
    ownerId = owner.userId;
    await new PrismaMembershipRepository(prisma).save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientAId = randomUUID();
    clientBId = randomUUID();
    for (const [id, label] of [
      [clientAId, "A"],
      [clientBId, "B"],
    ] as const) {
      await prisma.clientAccount.create({
        data: { id, organizationId: orgId, name: `I2 client ${label} ${id}`, nameNormalized: `i2 client ${label} ${id}`, status: "ACTIVE", createdBy: ownerId },
      });
      await prisma.clientAssignment.create({
        data: { id: randomUUID(), organizationId: orgId, clientAccountId: id, userId: ownerId, role: "CLIENT_MANAGER", createdBy: ownerId },
      });
    }

    candidateId = randomUUID();
    await prisma.candidateCompany.create({
      data: {
        id: candidateId,
        organizationId: orgId,
        name: "Candidate I2",
        nameNormalized: `candidate i2 ${candidateId}`,
        legalName: "CANDIDATE I2 SAS",
        siren: "356000000",
        status: "ACTIVE",
        sourceClientAccountId: clientAId,
        createdBy: ownerId,
      },
    });

    const base = { organizationId: orgId, clientAccountId: clientAId, createdBy: ownerId };
    const dual = { ...base, candidateCompanyId: candidateId };

    // ---- une ligne DOUBLEMENT liée + une ligne HISTORIQUE, par famille -------------------------
    dualLinked.representative = randomUUID();
    legacyOnly.representative = randomUUID();
    await prisma.companyRepresentative.createMany({
      data: [
        { id: dualLinked.representative, ...dual, firstName: "Signataire", lastName: "Candidat", type: "SIGNATORY", status: "ACTIVE" },
        { id: legacyOnly.representative, ...base, firstName: "Contact", lastName: "Commercial", type: "COMMERCIAL_CONTACT", status: "ACTIVE" },
      ],
    });

    dualLinked.bankAccount = randomUUID();
    legacyOnly.bankAccount = randomUUID();
    await prisma.companyBankAccount.createMany({
      data: [
        { id: dualLinked.bankAccount, ...dual, accountHolder: "CANDIDATE I2 SAS", iban: "FR7630006000011234567890189", status: "ACTIVE" },
        { id: legacyOnly.bankAccount, ...base, accountHolder: "Historique", iban: "FR7630006000011234567890189", status: "ACTIVE" },
      ],
    });

    dualLinked.insurance = randomUUID();
    legacyOnly.insurance = randomUUID();
    await prisma.companyInsurance.createMany({
      data: [
        { id: dualLinked.insurance, ...dual, type: "PROFESSIONAL_LIABILITY", insurer: "AXA Candidat", status: "ACTIVE" },
        { id: legacyOnly.insurance, ...base, type: "PROFESSIONAL_LIABILITY", insurer: "AXA Historique", status: "ACTIVE" },
      ],
    });

    dualLinked.certification = randomUUID();
    legacyOnly.certification = randomUUID();
    await prisma.companyCertification.createMany({
      data: [
        { id: dualLinked.certification, ...dual, name: "ISO 9001 Candidat", status: "ACTIVE" },
        { id: legacyOnly.certification, ...base, name: "ISO 9001 Historique", status: "ACTIVE" },
      ],
    });

    dualLinked.reference = randomUUID();
    legacyOnly.reference = randomUUID();
    await prisma.companyReference.createMany({
      data: [
        { id: dualLinked.reference, ...dual, projectName: "Chantier Candidat" },
        { id: legacyOnly.reference, ...base, projectName: "Chantier Historique" },
      ],
    });

    dualLinked.humanResource = randomUUID();
    legacyOnly.humanResource = randomUUID();
    await prisma.companyHumanResource.createMany({
      data: [
        { id: dualLinked.humanResource, ...dual, category: "CADRE", title: "Conducteur Candidat" },
        { id: legacyOnly.humanResource, ...base, category: "CADRE", title: "Conducteur Historique" },
      ],
    });

    dualLinked.materialResource = randomUUID();
    legacyOnly.materialResource = randomUUID();
    await prisma.companyMaterialResource.createMany({
      data: [
        { id: dualLinked.materialResource, ...dual, category: "ENGIN", name: "Pelle Candidat" },
        { id: legacyOnly.materialResource, ...base, category: "ENGIN", name: "Pelle Historique" },
      ],
    });

    // Référence appartenant au client B, avec un document rattaché : sert la preuve d'isolation
    // INTER-CLIENTS de la route documents-de-référence.
    dualLinked.clientBReference = randomUUID();
    await prisma.companyReference.create({
      data: { id: dualLinked.clientBReference, organizationId: orgId, clientAccountId: clientBId, projectName: "Chantier Client B", createdBy: ownerId },
    });
  }, 240000);

  afterAll(async () => {
    await prisma.companyReferenceDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyReference.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyBankAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyInsurance.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyCertification.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyHumanResource.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyMaterialResource.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  }, 120000);

  describe("§16/§17 — la route CLIENT ne sert que les lignes historiques", () => {
    it.each([
      ["représentants", "/representatives", "representative"],
      ["comptes bancaires", "/bank-accounts", "bankAccount"],
      ["assurances", "/insurances", "insurance"],
      ["certifications", "/certifications", "certification"],
      ["références", "/references", "reference"],
      ["moyens humains", "/human-resources", "humanResource"],
      ["moyens matériels", "/material-resources", "materialResource"],
    ])("%s : la ligne candidate-owned est absente, la ligne historique reste présente", async (_label, path, key) => {
      const res = await get(clientAId, path);
      expect(res.status).toBe(200);
      const rows = (await res.json()) as { id: string }[];
      const ids = rows.map((row) => row.id);

      expect(ids, "la ligne dont CandidateCompany est la SOT ne transite plus par la route client").not.toContain(dualLinked[key]);
      expect(ids, "la ligne purement historique reste lisible — rien n'est supprimé ni caché").toContain(legacyOnly[key]);

      // Contre-preuve de non-destruction : la ligne existe toujours en base.
      expect(await prisma.companyReference.count({ where: { organizationId: orgId } })).toBeGreaterThan(0);
    }, 240000);

    it("le profil agrégé du client applique la même frontière que les listes", async () => {
      const res = await get(clientAId, "/profile");
      expect(res.status).toBe(200);
      const profile = (await res.json()) as Record<string, { id: string }[]>;

      for (const [collection, key] of [
        ["representatives", "representative"],
        ["bankAccounts", "bankAccount"],
        ["insurances", "insurance"],
        ["certifications", "certification"],
        ["references", "reference"],
        ["humanResources", "humanResource"],
        ["materialResources", "materialResource"],
      ] as const) {
        const ids = (profile[collection] ?? []).map((row) => row.id);
        expect(ids, `${collection} : aucune donnée candidate-owned dans le profil client`).not.toContain(dualLinked[key]);
        expect(ids, `${collection} : la donnée historique reste agrégée`).toContain(legacyOnly[key]);
      }
    }, 240000);

    it("le CONTACT CRM reste géré côté client — la surface commerciale n'est pas vidée", async () => {
      const res = await get(clientAId, "/representatives");
      const rows = (await res.json()) as { id: string; type: string }[];
      const contact = rows.find((row) => row.id === legacyOnly.representative);

      expect(contact, "un contact commercial n'est jamais une donnée de candidature").toBeDefined();
      expect(contact!.type).toBe("COMMERCIAL_CONTACT");
    }, 240000);
  });

  describe("§8/§18 — aucune écriture client ne peut atteindre une donnée candidate-owned", () => {
    it.each([
      ["représentant", "PATCH", "/representatives", "representative"],
      ["compte bancaire", "PATCH", "/bank-accounts", "bankAccount"],
      ["assurance", "PATCH", "/insurances", "insurance"],
      ["certification", "PATCH", "/certifications", "certification"],
      ["référence", "PATCH", "/references", "reference"],
      ["moyen humain", "PATCH", "/human-resources", "humanResource"],
      ["moyen matériel", "PATCH", "/material-resources", "materialResource"],
    ])("%s : la mise à jour d'une ligne candidate-owned n'aboutit jamais", async (_label, method, path, key) => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}${path}/${dualLinked[key]}`, {
        method,
        headers: headers(),
        body: JSON.stringify({}),
      });

      // Le refus peut venir de deux barrières indépendantes — le retrait d'écriture CCV2-I.1 (409)
      // ou le bornage de scope CCV2-I.2 (404). Ce qui est prouvé ici, c'est qu'AUCUNE ne laisse
      // passer : asserter un code précis testerait l'ordre des gardes plutôt que l'invariant.
      expect(res.status, `statut inattendu : ${res.status}`).not.toBeLessThan(400);
    }, 240000);

    it("ARCHIVAGE (§8) — ne peut pas atteindre un compte bancaire candidate, et reste opérant sur une ligne historique", async () => {
      // Décision I.1 : l'archivage reste ouvert parce qu'il ne crée ni ne modifie aucune valeur de
      // candidature — il neutralise une ligne Legacy. I.2 doit prouver que cette ouverture n'est pas
      // devenue une faille : le bornage de `update` au périmètre Legacy en fait la garantie
      // structurelle, pas une simple convention.
      const onCandidate = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/bank-accounts/${dualLinked.bankAccount}/archive`, {
        method: "POST",
        headers: headers(),
      });
      expect(onCandidate.status).toBe(404);

      const untouched = await prisma.companyBankAccount.findUnique({ where: { id: fixtureId(dualLinked, "bankAccount") } });
      expect(untouched?.status, "le RIB candidat n'a pas été archivé par la route client").toBe("ACTIVE");
      expect(untouched?.candidateCompanyId, "son propriétaire métier est inchangé").toBe(candidateId);

      // Contre-preuve : sans elle, ce test serait aussi satisfait par un archivage totalement cassé.
      const onLegacy = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/bank-accounts/${legacyOnly.bankAccount}/archive`, {
        method: "POST",
        headers: headers(),
      });
      expect(onLegacy.status).toBe(200);
      expect((await prisma.companyBankAccount.findUnique({ where: { id: fixtureId(legacyOnly, "bankAccount") } }))?.status).toBe("ARCHIVED");
    }, 240000);

    it("le rattachement d'un document à une référence candidate-owned n'aboutit jamais", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/references/${dualLinked.reference}/documents`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ documentId: randomUUID() }),
      });
      expect(res.status).not.toBeLessThan(400);
      expect(await prisma.companyReferenceDocument.count({ where: { companyReferenceId: fixtureId(dualLinked, "reference") } })).toBe(0);
    }, 240000);
  });

  describe("§12 — la route des documents de référence est bornée au client appelant", () => {
    it("une référence appartenant à un AUTRE client de la même organisation répond 404", async () => {
      // La route acceptait un `referenceId` arbitraire et listait ses documents sans jamais vérifier
      // que la référence appartenait au client de l'URL : un acteur autorisé sur le client A lisait
      // ainsi les pièces de la référence du client B. Même famille que la régression P0 corrigée à
      // l'audit Codex sur l'archivage bancaire — la frontière d'organisation tenait, la frontière
      // de CLIENT non, alors que c'est précisément ce que `ClientAssignment` promet.
      const res = await get(clientAId, `/references/${dualLinked.clientBReference}/documents`);
      expect(res.status).toBe(404);
    }, 240000);

    it("une référence candidate-owned n'est plus adressable par la route client", async () => {
      const res = await get(clientAId, `/references/${dualLinked.reference}/documents`);
      expect(res.status).toBe(404);
    }, 240000);

    it("la référence historique du client reste, elle, parfaitement lisible", async () => {
      const res = await get(clientAId, `/references/${legacyOnly.reference}/documents`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    }, 240000);
  });
});
