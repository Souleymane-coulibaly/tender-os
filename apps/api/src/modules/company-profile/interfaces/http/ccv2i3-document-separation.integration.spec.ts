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
 * Checkpoint TENDEROS-2.1-CCV2-I.3 — FRONTIÈRE DOCUMENTAIRE finale entre `ClientAccount` (CRM,
 * commercial) et `CandidateCompany` (candidature, juridique).
 *
 * `Document` / `DocumentVersion` restent le MOTEUR technique partagé : un même fichier binaire peut
 * légitimement servir deux contextes. Ce qui doit rester distinct, c'est le SENS métier porté par
 * l'association — et surtout le fait qu'une pièce de candidature ne devienne jamais lisible sous une
 * permission commerciale plus faible.
 *
 * Ces preuves sont écrites de façon ADVERSARIALE : chaque test tente l'accès qu'on veut interdire,
 * plutôt que de vérifier que le chemin nominal fonctionne.
 */
describe("CCV2-I.3 — séparation documentaire Client CRM / CandidateCompany (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let ownerToken: string;
  let ownerId: string;
  /** Acteur SANS `candidate:read_banking` : c'est lui qui rend la fuite bancaire détectable. */
  let readOnlyToken: string;
  let readOnlyId: string;
  /** Acteur d'une AUTRE organisation. */
  let foreignToken: string;
  let foreignId: string;
  /**
   * Acteur reellement BORNE au client A : role d'organisation sans permission de portefeuille, plus
   * une affectation `CLIENT_MANAGER` sur le seul client A.
   *
   * Indispensable et non interchangeable avec l'OWNER : le modele d'acces est a DEUX PALIERS — un
   * role d'organisation qui detient deja la permission traverse legitimement les affectations. Une
   * sonde hostile menee avec l'OWNER ne prouverait donc rien sur le cloisonnement inter-clients ;
   * elle mesurerait un comportement voulu.
   */
  let scopedToken: string;
  let scopedId: string;

  let clientA: string;
  let clientB: string;
  let candidateA: string;
  let orgBClient: string;

  /** Document de CANDIDATURE bancaire (RIB) — le plus sensible du jeu. */
  let bankingDocumentId: string;
  /** Document commercial légitime du client A. */
  let commercialDocumentId: string;
  /** Document PARTAGÉ : association client ET association candidate. */
  let sharedDocumentId: string;
  /** Document commercial du client B — sert les preuves d'isolation inter-clients. */
  let clientBDocumentId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-I3", termsAccepted: true }),
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

  async function setRole(organizationId: string, userId: string, roleCode: string): Promise<void> {
    const membership = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
    if (!membership) throw new Error(`Aucune adhésion pour ${userId}`);
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new Error(`Rôle inconnu : ${roleCode}`);
    await prisma.membershipRole.deleteMany({ where: { membershipId: membership.id } });
    await prisma.membershipRole.create({ data: { membershipId: membership.id, roleId: role.id } });
  }

  /** Upload réel par le moteur documentaire — jamais une ligne fabriquée en base : c'est le chemin
   *  que prend un utilisateur, et donc le seul qui prouve quelque chose sur le produit. */
  async function uploadDocument(title: string, token: string, organizationId = orgA): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("%PDF-1.4\n%%EOF\n")], { type: "application/pdf" }), "piece.pdf");
    form.append("title", title);
    form.append("domain", "ORGANIZATION");
    form.append("origin", "USER_UPLOAD");
    const res = await fetch(`${baseUrl}/api/v1/documents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId },
      body: form,
    });
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new Error(`Upload échoué (${res.status}) : ${JSON.stringify(body)}`);
    return body.id;
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
    const memberships = new PrismaMembershipRepository(prisma);

    for (const [id, label] of [
      [orgA, "A"],
      [orgB, "B"],
    ] as const) {
      await prisma.organization.create({ data: { id, name: `I3 ${label}`, slug: `i3-${label}-${id}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    }

    const owner = await registerAndLogin(`i3-owner-${randomUUID()}@smoke.test`);
    const readOnly = await registerAndLogin(`i3-ro-${randomUUID()}@smoke.test`);
    const foreign = await registerAndLogin(`i3-foreign-${randomUUID()}@smoke.test`);
    const scoped = await registerAndLogin(`i3-scoped-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, readOnly.userId, foreign.userId, scoped.userId);
    scopedToken = scoped.token;
    scopedId = scoped.userId;
    ownerToken = owner.token;
    ownerId = owner.userId;
    readOnlyToken = readOnly.token;
    readOnlyId = readOnly.userId;
    foreignToken = foreign.token;
    foreignId = foreign.userId;

    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: ownerId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: readOnlyId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: foreignId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await memberships.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: scopedId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await setRole(orgA, readOnlyId, "READ_ONLY");

    clientA = randomUUID();
    clientB = randomUUID();
    orgBClient = randomUUID();
    for (const [id, org, label] of [
      [clientA, orgA, "A"],
      [clientB, orgA, "B"],
      [orgBClient, orgB, "orgB"],
    ] as const) {
      await prisma.clientAccount.create({
        data: { id, organizationId: org, name: `I3 client ${label} ${id}`, nameNormalized: `i3 client ${label} ${id}`, status: "ACTIVE", createdBy: org === orgA ? ownerId : foreignId },
      });
    }
    // L'OWNER est affecté au client A UNIQUEMENT : le client B sert donc de cible hostile légitime.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientA, userId: ownerId, role: "CLIENT_MANAGER", createdBy: ownerId },
    });
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgA, clientAccountId: clientA, userId: scopedId, role: "CLIENT_MANAGER", createdBy: ownerId },
    });

    candidateA = randomUUID();
    await prisma.candidateCompany.create({
      data: {
        id: candidateA,
        organizationId: orgA,
        name: "Candidate I3",
        nameNormalized: `candidate i3 ${candidateA}`,
        legalName: "CANDIDATE I3 SAS",
        siren: "356000000",
        status: "ACTIVE",
        createdBy: ownerId,
      },
    });

    bankingDocumentId = await uploadDocument("RIB Candidate I3", ownerToken);
    commercialDocumentId = await uploadDocument("Contrat cadre client A", ownerToken);
    sharedDocumentId = await uploadDocument("Piece partagee I3", ownerToken);
    clientBDocumentId = await uploadDocument("Contrat client B", ownerToken);

    // RIB rattaché à l'entreprise candidate sous une catégorie BANCAIRE.
    await prisma.documentCandidateCompanyAssociation.create({
      data: { id: randomUUID(), organizationId: orgA, documentId: bankingDocumentId, candidateCompanyId: candidateA, category: "BANK_DETAILS", createdByUserId: ownerId },
    });
    // Document PARTAGÉ — exactement l'état d'un document migré : les deux associations coexistent.
    await prisma.documentCandidateCompanyAssociation.create({
      data: { id: randomUUID(), organizationId: orgA, documentId: sharedDocumentId, candidateCompanyId: candidateA, category: "KBIS", createdByUserId: ownerId },
    });
    await prisma.documentClientAccountAssociation.create({
      data: { id: randomUUID(), organizationId: orgA, documentId: sharedDocumentId, clientAccountId: clientA, category: "OTHER", createdByUserId: ownerId },
    });
    // Document commercial du client B, auquel l'OWNER n'est pas affecté.
    await prisma.documentClientAccountAssociation.create({
      data: { id: randomUUID(), organizationId: orgA, documentId: clientBDocumentId, clientAccountId: clientB, category: "COMMERCIAL_CONTRACT", createdByUserId: ownerId },
    });
  }, 300000);

  afterAll(async () => {
    for (const org of [orgA, orgB]) {
      await prisma.documentClientAccountAssociation.deleteMany({ where: { organizationId: org } });
      await prisma.documentCandidateCompanyAssociation.deleteMany({ where: { organizationId: org } });
      await prisma.documentVersion.deleteMany({ where: { organizationId: org } });
      await prisma.document.deleteMany({ where: { organizationId: org } });
      await prisma.candidateCompany.deleteMany({ where: { organizationId: org } });
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

  describe("§7/§8 — aucune association croisée n'est créée automatiquement", () => {
    it("un dépôt commercial côté client ne crée JAMAIS d'association candidate", async () => {
      const documentId = await uploadDocument("Brief commercial I3", ownerToken);
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents`, {
        method: "POST",
        headers: headers(ownerToken),
        body: JSON.stringify({ documentId, category: "CLIENT_BRIEF" }),
      });
      expect(res.status).toBe(201);

      // Une seule entreprise candidate existe dans l'organisation : c'est précisément le cas où une
      // inférence « évidente » serait tentante. Elle reste interdite.
      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId } })).toBe(0);
    }, 300000);

    it("un rattachement candidate ne crée JAMAIS d'association client", async () => {
      const documentId = await uploadDocument("Kbis candidate I3", ownerToken);
      const res = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/documents`, {
        method: "POST",
        headers: headers(ownerToken),
        body: JSON.stringify({ documentId, category: "KBIS" }),
      });
      expect(res.status).toBe(201);

      expect(await prisma.documentClientAccountAssociation.count({ where: { documentId } })).toBe(0);
    }, 300000);
  });

  describe("§10/§27 — catégorie et autorisation, dans le bon ordre", () => {
    it("une catégorie de candidature est refusée en 422 pour un acteur AUTORISÉ", async () => {
      const documentId = await uploadDocument("Kbis mal range I3", ownerToken);
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents`, {
        method: "POST",
        headers: headers(ownerToken),
        body: JSON.stringify({ documentId, category: "KBIS" }),
      });
      expect(res.status).toBe(422);
      expect(await res.text()).toContain("CandidateCompany");
    }, 300000);

    it("un acteur NON AUTORISÉ reçoit son refus d'accès, jamais un 422 qui révélerait la validité de sa catégorie", async () => {
      // L'ordre des gardes est un fait de sécurité : si la catégorie est évaluée en premier, un
      // acteur sans droit apprend, par la différence entre 422 et 404, que sa catégorie aurait été
      // acceptée — et le produit répond à quelqu'un qu'il aurait dû ignorer. Leçon CCV2-I.1.
      const documentId = await uploadDocument("Sonde ordre gardes I3", ownerToken);
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientB}/documents`, {
        method: "POST",
        headers: headers(scopedToken),
        body: JSON.stringify({ documentId, category: "KBIS" }),
      });

      expect([403, 404], `statut obtenu : ${res.status}`).toContain(res.status);
    }, 300000);
  });

  describe("§11/§12 — isolation inter-clients des documents", () => {
    it("la liste des documents du client A n'expose jamais ceux du client B", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents`, { headers: headers(ownerToken) });
      expect(res.status).toBe(200);
      const rows = (await res.json()) as { documentId: string }[];

      expect(rows.map((row) => row.documentId)).not.toContain(clientBDocumentId);
    }, 300000);

    it("un acteur affecté au SEUL client A ne peut pas lister les documents du client B", async () => {
      const res = await fetch(`${baseUrl}/api/v1/clients/${clientB}/documents`, { headers: headers(scopedToken) });
      expect([403, 404], `statut obtenu : ${res.status}`).toContain(res.status);

      // Contre-preuve : le meme acteur lit parfaitement les documents de SON client — le refus
      // ci-dessus est bien un cloisonnement, pas une permission manquante.
      const own = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents`, { headers: headers(scopedToken) });
      expect(own.status).toBe(200);
    }, 300000);
  });

  describe("§14/§15/§16 — le RIB candidat ne fuit par aucune surface documentaire générique", () => {
    it("LISTE générique : un acteur sans droit bancaire ne voit pas le document bancaire candidate", async () => {
      // La liste expose titre, taille et métadonnées de version. Ce n'est pas l'IBAN, mais c'est
      // l'existence et la nature d'une pièce bancaire — et la mission §15 demande explicitement de
      // PROUVER que le listing générique ne contourne pas le bornage, plutôt que de le supposer.
      const res = await fetch(`${baseUrl}/api/v1/documents?limit=100`, { headers: headers(readOnlyToken) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { id: string }[] };

      expect(body.items.map((item) => item.id), "le RIB candidat ne doit pas apparaître").not.toContain(bankingDocumentId);
      // Contre-preuve : sans elle, ce test passerait aussi si la liste était vide ou cassée.
      expect(body.items.map((item) => item.id), "les documents non sensibles restent listés").toContain(commercialDocumentId);
    }, 300000);

    it("DÉTAIL : le document bancaire candidate est refusé sans permission bancaire", async () => {
      const res = await fetch(`${baseUrl}/api/v1/documents/${bankingDocumentId}`, { headers: headers(readOnlyToken) });
      expect(res.status).not.toBeLessThan(400);
    }, 300000);

    it("HISTORIQUE DE VERSIONS : régression CCV2-F.1 — aucune métadonnée sensible sans permission bancaire", async () => {
      const res = await fetch(`${baseUrl}/api/v1/documents/${bankingDocumentId}/versions`, { headers: headers(readOnlyToken) });
      expect(res.status).not.toBeLessThan(400);
    }, 300000);

    it("TÉLÉCHARGEMENT : refusé sans permission bancaire", async () => {
      const res = await fetch(`${baseUrl}/api/v1/documents/${bankingDocumentId}/download`, { headers: headers(readOnlyToken) });
      expect(res.status).not.toBeLessThan(400);
    }, 300000);

    it("le propriétaire, lui, accède normalement — la restriction est ciblée, pas un blocage général", async () => {
      const res = await fetch(`${baseUrl}/api/v1/documents/${bankingDocumentId}`, { headers: headers(ownerToken) });
      expect(res.status).toBe(200);
    }, 300000);
  });

  describe("§26 — sécurité du document PARTAGÉ", () => {
    it("les deux associations coexistent et restent lisibles chacune par sa route", async () => {
      const clientSide = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents`, { headers: headers(ownerToken) });
      const clientRows = (await clientSide.json()) as { documentId: string }[];
      expect(clientRows.map((row) => row.documentId)).toContain(sharedDocumentId);

      const candidateSide = await fetch(`${baseUrl}/api/v1/candidate-companies/${candidateA}/documents`, { headers: headers(ownerToken) });
      expect(candidateSide.status).toBe(200);
      const candidateBody = (await candidateSide.json()) as { items: { documentId: string }[] };
      expect(candidateBody.items.map((row) => row.documentId)).toContain(sharedDocumentId);
    }, 300000);

    it("aucune route CLIENT ne permet de détacher ou supprimer le document partagé", async () => {
      // Constat de conception, vérifié plutôt qu'affirmé : la surface client n'expose ni DELETE ni
      // détachement. La preuve de sécurité du §26 est donc structurelle — il n'existe pas de chemin
      // client capable de détruire la pièce de candidature.
      const detach = await fetch(`${baseUrl}/api/v1/clients/${clientA}/documents/${sharedDocumentId}`, {
        method: "DELETE",
        headers: headers(ownerToken),
      });
      expect(detach.status, "aucune route de détachement côté client").toBe(404);

      expect(await prisma.documentCandidateCompanyAssociation.count({ where: { documentId: sharedDocumentId } })).toBe(1);
      expect(await prisma.documentClientAccountAssociation.count({ where: { documentId: sharedDocumentId } })).toBe(1);
    }, 300000);
  });

  describe("§28 — isolation inter-organisations", () => {
    it("une organisation étrangère ne peut ni voir ni rattacher un document d'une autre", async () => {
      const detail = await fetch(`${baseUrl}/api/v1/documents/${commercialDocumentId}`, { headers: headers(foreignToken, orgB) });
      expect(detail.status, "anti-énumération inter-organisations").toBe(404);

      const attach = await fetch(`${baseUrl}/api/v1/clients/${orgBClient}/documents`, {
        method: "POST",
        headers: headers(foreignToken, orgB),
        body: JSON.stringify({ documentId: commercialDocumentId, category: "COMMERCIAL_CONTRACT" }),
      });
      expect(attach.status).not.toBeLessThan(400);
      expect(await prisma.documentClientAccountAssociation.count({ where: { documentId: commercialDocumentId, clientAccountId: orgBClient } })).toBe(0);
    }, 300000);
  });
});
