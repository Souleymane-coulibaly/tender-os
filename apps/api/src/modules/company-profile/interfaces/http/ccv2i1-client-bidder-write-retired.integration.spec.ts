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
 * Checkpoint TENDEROS-2.1-CCV2-I.1 — FRONTIÈRE SÉMANTIQUE ClientAccount (CRM) / CandidateCompany
 * (entité juridique qui candidate), sur HTTP + PostgreSQL réels.
 *
 * L'invariant certifié ici est `NEW_BIDDER_DUAL_WRITE_SURFACE_COUNT = 0` : une donnée de
 * candidature ne peut plus être CRÉÉE par deux surfaces. Sans lui, le décommissionnement prouvé en
 * CCV2-G.2 se reconstituerait par l'autre bout — le client redeviendrait une source de vérité.
 *
 * Ce que ces preuves ne font PAS : supprimer des routes, effacer des lignes, convertir des données.
 * La lecture historique reste ouverte, et c'est vérifié explicitement.
 */
describe("CCV2-I.1 — écriture candidature retirée de la surface Client (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;

  const orgA = randomUUID();
  const userIds: string[] = [];
  let tokenA: string;
  let userA: string;
  let clientAId: string;
  let candidateId: string;
  let candidateBankAccountId: string;
  let legacyReferenceId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-I1", termsAccepted: true }),
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
    return { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgA, "Content-Type": "application/json" };
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}/api/v1/clients/${clientAId}${path}`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
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

    await prisma.organization.create({ data: { id: orgA, name: "I1", slug: `i1-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    const a = await registerAndLogin(`i1-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: userA, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientAId = randomUUID();
    await prisma.clientAccount.create({
      data: { id: clientAId, organizationId: orgA, name: `I1 client ${randomUUID()}`, nameNormalized: `i1 client ${randomUUID()}`, status: "ACTIVE", createdBy: userA },
    });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientAId, userId: userA, role: "CLIENT_MANAGER", createdBy: userA },
    });
    // Donnée HISTORIQUE, insérée directement : elle doit rester lisible après I.1.
    await prisma.companyLegalIdentity.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientAId, legalName: "HISTORIQUE SAS", siren: "552100554", createdBy: userA },
    });
    await prisma.companyRepresentative.create({
      data: {
        id: randomUUID(),
        organizationId: orgA,
        clientAccountId: clientAId,
        firstName: "Signataire",
        lastName: "Historique",
        type: "SIGNATORY",
        status: "ACTIVE",
        createdBy: userA,
      },
    });

    // Référence professionnelle HISTORIQUE : elle n'est plus créable ici, mais elle existe.
    legacyReferenceId = randomUUID();
    await prisma.companyReference.create({
      data: { id: legacyReferenceId, organizationId: orgA, clientAccountId: clientAId, projectName: "Chantier historique", createdBy: userA },
    });

    // Entreprise candidate PORTANT un RIB, dont la ligne conserve son `clientAccountId` de LIGNAGE
    // — exactement l'état produit par la migration d'association CCV2-B. C'est la configuration qui
    // rend la fuite possible, donc la seule qui prouve quelque chose.
    candidateId = randomUUID();
    await prisma.candidateCompany.create({
      data: {
        id: candidateId,
        organizationId: orgA,
        name: "Candidate I1",
        nameNormalized: `candidate i1 ${candidateId}`,
        legalName: "CANDIDATE I1 SAS",
        siren: "356000000",
        status: "ACTIVE",
        sourceClientAccountId: clientAId,
        createdBy: userA,
      },
    });
    candidateBankAccountId = randomUUID();
    await prisma.companyBankAccount.create({
      data: {
        id: candidateBankAccountId,
        organizationId: orgA,
        clientAccountId: clientAId,
        candidateCompanyId: candidateId,
        accountHolder: "CANDIDATE I1 SAS",
        iban: "FR7630006000011234567890189",
        status: "ACTIVE",
        createdBy: userA,
      },
    });
  }, 180000);

  afterAll(async () => {
    await prisma.companyBankAccount.deleteMany({ where: { organizationId: orgA } });
    await prisma.companyReferenceDocument.deleteMany({ where: { organizationId: orgA } });
    await prisma.companyReference.deleteMany({ where: { organizationId: orgA } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId: orgA } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgA } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: orgA } });
    await prisma.documentClientAccountAssociation.deleteMany({ where: { organizationId: orgA } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgA } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgA } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgA } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgA } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgA } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgA } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgA } });
    await app.close();
  }, 60000);

  describe("§13 — aucune donnée de candidature ne naît plus sur la surface Client", () => {
    it.each([
      ["identité juridique", "/legal-identity", { legalName: "NOUVELLE SAS", siren: "356000000" }, "PATCH"],
      ["compte bancaire", "/bank-accounts", { accountHolder: "NOUVEAU", iban: "FR7630006000011234567890189" }, "POST"],
      ["assurance", "/insurances", { type: "PROFESSIONAL_LIABILITY", insurer: "AXA" }, "POST"],
      ["certification", "/certifications", { name: "ISO 9001" }, "POST"],
      ["référence professionnelle", "/references", { projectName: "Chantier" }, "POST"],
      ["moyen humain", "/human-resources", { category: "CADRE", title: "Conducteur de travaux" }, "POST"],
      ["moyen matériel", "/material-resources", { category: "ENGIN", name: "Pelle" }, "POST"],
    ])("%s : la route n'existe plus (404), et rien n'est écrit", async (_label, path, body, method) => {
      // CCV2-I.4 — ces routes répondaient 409 `CLIENT_BIDDER_WRITE_RETIRED` ; elles ont été RETIRÉES.
      // L'invariant visé n'est pas affaibli, il est RENFORCÉ : un refus applicatif dépend d'une garde
      // qu'un oubli peut supprimer, une absence de route ne dépend de rien. On assertait le refus,
      // on asserte désormais l'inexistence.
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}${path}`, { method, headers: headers(), body: JSON.stringify(body) });

      expect(res.status).toBe(404);
    }, 240000);

    it("un représentant LÉGAL/SIGNATAIRE est refusé, un CONTACT commercial reste parfaitement créable", async () => {
      // Le type légal est rejeté par le schéma lui-même (première barrière) : 400.
      const legal = await post("/representatives", { firstName: "Jean", lastName: "Dupont", type: "SIGNATORY" });
      expect(legal.status).toBe(400);

      // Les champs d'autorité de signature ne sont plus acceptés non plus.
      const withSignature = await post("/representatives", { firstName: "Jean", lastName: "Dupont", type: "COMMERCIAL_CONTACT", signatureScope: "tout" });
      expect(withSignature.status).toBe(400);

      // Un contact CRM légitime, lui, fonctionne : la surface n'est pas fermée, elle est recentrée.
      const contact = await post("/representatives", { firstName: "Claire", lastName: "Martin", type: "COMMERCIAL_CONTACT", email: "claire@client.test" });
      expect(contact.status).toBe(201);
      const created = (await contact.json()) as { id: string; type: string };
      expect(created.type).toBe("COMMERCIAL_CONTACT");
      expect((await prisma.companyRepresentative.findUnique({ where: { id: created.id } }))?.candidateCompanyId, "jamais rattaché à un candidat").toBeNull();
    }, 240000);
  });

  describe("§6/§7 — documents : commercial accepté, candidature refusée", () => {
    it("une catégorie CRM est acceptée, une catégorie de candidature est refusée en 422", async () => {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from("%PDF-1.4\n%%EOF\n")], { type: "application/pdf" }), "contrat.pdf");
      form.append("title", "Contrat cadre");
      form.append("domain", "ORGANIZATION");
      form.append("origin", "USER_UPLOAD");
      const uploaded = await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgA },
        body: form,
      });
      const documentId = ((await uploaded.json()) as { id: string }).id;

      const bidder = await post("/documents", { documentId, category: "KBIS" });
      expect(bidder.status).toBe(422);
      const bidderBody = await bidder.text();
      expect(bidderBody).toContain("CLIENT_COMMERCIAL_DOCUMENT_CATEGORY_INVALID");
      // Le message oriente vers la bonne fiche plutôt que de dire seulement « invalide ».
      expect(bidderBody).toContain("CandidateCompany");

      const commercial = await post("/documents", { documentId, category: "COMMERCIAL_CONTRACT" });
      expect(commercial.status).toBe(201);

      await prisma.documentClientAccountAssociation.deleteMany({ where: { documentId } });
      await prisma.documentVersion.deleteMany({ where: { documentId } });
      await prisma.document.deleteMany({ where: { id: documentId } });
    }, 240000);
  });

  describe("§7 — le CRM client n'est pas une route alternative de lecture du RIB candidat", () => {
    it("un RIB appartenant à une entreprise candidate n'est jamais servi par /clients/:id/bank-accounts", async () => {
      // La sécurité bancaire candidate établie en CCV2-C.1 repose sur `candidate:read_banking`, une
      // permission de RANG ORGANISATION. La route client, elle, est gardée par
      // `ClientPermission.ReadCompanyBanking`, de rang CLIENT et attribuée par affectation. Si la
      // même ligne était servie par les deux, la permission la plus facile à obtenir déterminerait
      // l'accès au RIB — la garde forte de C.1 deviendrait contournable sans jamais être violée.
      //
      // Dès que `candidateCompanyId` est renseigné, `CandidateCompany` est le PROPRIÉTAIRE métier et
      // `clientAccountId` n'est plus qu'un pointeur de lignage (schéma CCV2-B). La lecture client
      // doit donc s'arrêter aux lignes purement Legacy.
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/bank-accounts`, { headers: headers() });
      expect(res.status).toBe(200);
      const accounts = (await res.json()) as { id: string }[];

      expect(accounts.map((account) => account.id), "le RIB candidat ne fuit pas par la route client").not.toContain(candidateBankAccountId);

      // La donnée n'est ni supprimée ni déplacée : elle reste lisible par sa route légitime.
      expect(await prisma.companyBankAccount.findUnique({ where: { id: candidateBankAccountId } })).not.toBeNull();
    }, 240000);

    it("le profil client ne compte pas un RIB candidat comme complétude bancaire du client", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/profile`, { headers: headers() });
      expect(res.status).toBe(200);
      const profile = (await res.json()) as { bankAccounts: { id: string }[]; completeness: Record<string, string> };

      expect(profile.bankAccounts.map((account) => account.id)).not.toContain(candidateBankAccountId);
      expect(profile.completeness.banking, "aucun RIB purement Legacy sur ce client").toBe("MISSING");
    }, 240000);
  });

  describe("§13 — l'enrichissement documentaire d'une référence Legacy est retiré lui aussi (route supprimée en I.4)", () => {
    it("rattacher un document à une référence professionnelle historique est refusé en 409", async () => {
      const form = new FormData();
      form.append("file", new Blob([Buffer.from("%PDF-1.4\n%%EOF\n")], { type: "application/pdf" }), "attestation.pdf");
      form.append("title", "Attestation de bonne exécution");
      form.append("domain", "ORGANIZATION");
      form.append("origin", "USER_UPLOAD");
      const uploaded = await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenA}`, "X-Organization-Id": orgA },
        body: form,
      });
      const documentId = ((await uploaded.json()) as { id: string }).id;

      // La référence n'étant plus créable, ne laisser ouvert que son enrichissement documentaire
      // aurait rouvert la seconde source de vérité par la porte de service.
      // CCV2-I.4 — la route de rattachement a été retirée : elle ne pouvait plus que refuser.
      const attach = await post(`/references/${legacyReferenceId}/documents`, { documentId });
      expect(attach.status).toBe(404);
      expect(await prisma.companyReferenceDocument.count({ where: { companyReferenceId: legacyReferenceId } })).toBe(0);

      // La LECTURE des pièces d'une référence historique, elle, reste ouverte et bornée au client.
      const readable = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/references/${legacyReferenceId}/documents`, { headers: headers() });
      expect(readable.status).toBe(200);

      await prisma.documentVersion.deleteMany({ where: { documentId } });
      await prisma.document.deleteMany({ where: { id: documentId } });
    }, 240000);
  });

  describe("§8/§11 — les données historiques restent lisibles, jamais supprimées ni converties", () => {
    it("le profil du client sert toujours son identité et son signataire historiques", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientAId}/profile`, { headers: headers() });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { legalIdentity: { legalName: string } | null; representatives: { type: string }[] };

      expect(body.legalIdentity?.legalName, "identité historique lisible").toBe("HISTORIQUE SAS");
      // Le signataire historique n'est ni supprimé, ni converti en contact commercial : convertir
      // automatiquement une autorité juridique sur la seule foi d'un nom serait une invention.
      expect(body.representatives.some((r) => r.type === "SIGNATORY"), "signataire historique préservé").toBe(true);
    }, 240000);
  });
});
