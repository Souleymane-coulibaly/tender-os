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
 * Mission V2 Sprint 2 §13 — parcours réel HTTP + PostgreSQL : identité légale, permissions
 * (CONTRIBUTOR sans affectation client refusé, VIEWER avec affectation mais sans droit bancaire
 * refusé), masquage IBAN en liste, isolation multi-tenant.
 *
 * CONTRATS D'ÉCRITURE VOLONTAIREMENT INVERSÉS — Checkpoint TENDEROS-2.1-CCV2-I.1. La CRÉATION et la
 * MISE À JOUR de données de candidature via `/clients/:id/*` sont retirées : leur source de vérité
 * inscriptible est désormais `CandidateCompany`. Les tests qui les exerçaient assertent maintenant
 * le refus `409 CLIENT_BIDDER_WRITE_RETIRED` — le produit a changé, les tests le disent.
 *
 * CE QUI N'A PAS CHANGÉ, ET RESTE PROUVÉ ICI À L'IDENTIQUE — c'est la moitié essentielle de ces
 * tests, et elle survit intacte parce que les propriétés visées sont des propriétés de LECTURE et de
 * SÉCURITÉ, indépendantes de la façon dont la ligne est née : masquage IBAN en liste, archivage
 * jamais destructif, cloisonnement inter-clients (P0 audit Codex), 404 anti-énumération inter-org,
 * complétude par catégorie, VIEWER lecteur mais non gestionnaire. Ces lignes sont donc AMORCÉES
 * directement en base — exactement l'état d'une donnée historique après I.1 — plutôt que créées par
 * une route désormais fermée. Supprimer ces tests aurait fait disparaître des garanties de sécurité
 * toujours actives.
 */
describe("Company Profile — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const clientAccountId = randomUUID();
  const secondClientAccountId = randomUUID();
  const otherOrgClientAccountId = randomUUID();
  const userIds: string[] = [];
  // Lignes HISTORIQUES amorcées directement (voir en-tête) : elles représentent l'état d'un client
  // dont le profil candidature a été renseigné AVANT le retrait de la surface d'écriture.
  const legacyMaskedBankAccountId = randomUUID();
  const legacyArchivableBankAccountId = randomUUID();
  const legacyClientBBankAccountId = randomUUID();
  let tokenOwner: string;
  let tokenNoAssignment: string;
  let tokenViewer: string;
  let tokenClientManagerA: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Company Profile Test", termsAccepted: true }),
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

  function authHeaders(token: string, organizationId = orgId): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgId, name: "Company Profile Org", slug: `company-profile-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: otherOrgId, name: "Company Profile Other Org", slug: `company-profile-other-org-${otherOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`company-profile-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const noAssignment = await registerAndLogin(`company-profile-no-assignment-${randomUUID()}@smoke.test`);
    userIds.push(noAssignment.userId);
    tokenNoAssignment = noAssignment.token;

    const viewer = await registerAndLogin(`company-profile-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    tokenViewer = viewer.token;

    const clientManagerA = await registerAndLogin(`company-profile-manager-a-${randomUUID()}@smoke.test`);
    userIds.push(clientManagerA.userId);
    tokenClientManagerA = clientManagerA.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: noAssignment.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: viewer.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: clientManagerA.userId, role: OrganizationRole.Contributor, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Profil Entreprise", nameNormalized: "client profil entreprise", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.clientAccount.create({ data: { id: secondClientAccountId, organizationId: orgId, name: "Client Profil Entreprise 2", nameNormalized: "client profil entreprise 2", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.clientAccount.create({ data: { id: otherOrgClientAccountId, organizationId: otherOrgId, name: "Client Autre Org", nameNormalized: "client autre org", status: "ACTIVE", createdBy: owner.userId } });

    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: owner.userId },
    });
    // Correctif audit Codex P0 — affecté CLIENT_MANAGER sur `clientAccountId` UNIQUEMENT, jamais
    // sur `secondClientAccountId` : sert à prouver qu'un accès légitime sur le Client A ne permet
    // plus de muter une ressource du Client B de la même organisation.
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, userId: clientManagerA.userId, role: "CLIENT_MANAGER", createdBy: owner.userId },
    });

    // Identité juridique HISTORIQUE, complète sur les six champs de `computeIdentityStatus`.
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        clientAccountId,
        legalName: "Entreprise Test SAS",
        siren: "356000000",
        siretPrincipal: "35600000000048",
        addressLine: "12 rue de la République",
        postalCode: "75001",
        city: "Paris",
        createdBy: owner.userId,
      },
    });
    // Trois comptes bancaires HISTORIQUES, un par propriété prouvée — jamais partagés entre tests,
    // pour qu'un archivage ne rende pas le masquage dépendant de l'ordre d'exécution.
    await prisma.companyBankAccount.createMany({
      data: [
        { id: legacyMaskedBankAccountId, organizationId: orgId, clientAccountId, accountHolder: "Entreprise Test SAS", iban: "FR7630006000011234567890189", status: "ACTIVE", createdBy: owner.userId },
        { id: legacyArchivableBankAccountId, organizationId: orgId, clientAccountId: secondClientAccountId, accountHolder: "Autre Entreprise", iban: "FR7630006000011234567890189", status: "ACTIVE", createdBy: owner.userId },
        { id: legacyClientBBankAccountId, organizationId: orgId, clientAccountId: secondClientAccountId, accountHolder: "Client B Holder", iban: "FR7630006000011234567890189", status: "ACTIVE", createdBy: owner.userId },
      ],
    });
  }, 60000);

  afterAll(async () => {
    await prisma.companyReferenceDocument.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyReference.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyHumanResource.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyMaterialResource.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyCertification.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyInsurance.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyBankAccount.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyRepresentative.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.documentClientAccountAssociation.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgId, otherOrgId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await app.close();
  });

  it("CCV2-I.4 — PATCH .../legal-identity n'existe plus (404), et l'identité historique reste intacte", async () => {
    // La règle de FORMAT du SIREN n'a pas disparu du produit : elle est appliquée à sa nouvelle
    // source de vérité, `CandidateCompany` (prouvé en CCV2-G.1/F.1 par `isValidSiren`). Ici, le
    // refus intervient plus tôt — inutile de valider la forme d'une donnée qu'on n'écrira pas.
    const invalid = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ siren: "123" }),
    });
    expect(invalid.status).toBe(404);

    const valid = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Renommage Interdit", siren: "356000000" }),
    });
    expect(valid.status).toBe(404);

    // Le refus est TOTAL : aucune écriture partielle avant la levée.
    const stored = await prisma.companyLegalIdentity.findFirst({ where: { organizationId: orgId, clientAccountId } });
    expect(stored?.legalName, "l'identité historique n'a pas été altérée").toBe("Entreprise Test SAS");
  });

  it("CCV2-I.1 — le doublon SIRET inter-clients n'est plus arbitré ici : l'écriture est refusée en amont", async () => {
    // L'arbitrage `confirmDuplicate` existait parce que DEUX ClientAccounts commerciaux pouvaient
    // légitimement désigner la même société réelle. Cette ambiguïté est précisément ce que la
    // frontière CRM/candidat supprime : le SIRET appartient à `CandidateEstablishment`, où il est
    // contraint par un index unique `(organization_id, siret)` — une garantie de base, plus forte
    // que l'arbitrage applicatif qu'elle remplace.
    const duplicate = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Entreprise", siretPrincipal: "35600000000048" }),
    });
    expect(duplicate.status).toBe(404);

    // `confirmDuplicate` ne rouvre aucun contournement : le refus ne dépend pas du corps envoyé.
    const confirmed = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/legal-identity`, {
      method: "PATCH",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Autre Entreprise", siretPrincipal: "35600000000048", confirmDuplicate: true }),
    });
    expect(confirmed.status).toBe(404);
    expect(await prisma.companyLegalIdentity.findFirst({ where: { organizationId: orgId, clientAccountId: secondClientAccountId } })).toBeNull();
  });

  it("rejects mass assignment — an unknown field in the body is a validation error, never silently ignored", async () => {
    // CCV2-I.4 — l'invariant est DÉPLACÉ, jamais perdu : sa route d'origine (`PATCH
    // .../legal-identity`) a été retirée, mais la protection anti-mass-assignment reste une garantie
    // vivante du produit. Elle est donc vérifiée sur une route CRM survivante, dont le schéma est
    // également `.strict()`. Supprimer ce test avec sa route aurait fait disparaître une couverture
    // de sécurité toujours active.
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/representatives`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ firstName: "Jean", lastName: "Dupont", type: "COMMERCIAL_CONTACT", organizationId: randomUUID() }),
    });
    expect(res.status).toBe(400);
  });

  it("a CONTRIBUTOR with no ClientAssignment on this client is denied — 404, never leaking existence (same convention as Client Portfolio)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, { headers: authHeaders(tokenNoAssignment) });
    expect(res.status).toBe(404);
  });

  it("a VIEWER can read the profile but cannot manage it (403)", async () => {
    const readRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, { headers: authHeaders(tokenViewer) });
    expect(readRes.status).toBe(200);

    // CCV2-I.4 — la moitié ÉCRITURE de cette preuve est portée par une route CRM survivante : le
    // RBAC testé ici (`VIEWER` lecteur mais non gestionnaire) reste une règle active du produit, et
    // la disparition de son ancienne route ne doit pas la faire disparaître de la couverture.
    const writeRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/representatives`, {
      method: "POST",
      headers: authHeaders(tokenViewer),
      body: JSON.stringify({ firstName: "Refuse", lastName: "Viewer", type: "COMMERCIAL_CONTACT" }),
    });
    expect(writeRes.status).toBe(403);
  });

  it("a VIEWER (no dedicated banking permission) is denied access to bank accounts entirely (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts`, { headers: authHeaders(tokenViewer) });
    expect(res.status).toBe(403);
  });

  it("un IBAN stocké en clair est toujours retourné MASQUÉ dans la vue liste", async () => {
    // Propriété de LECTURE, inchangée par I.1 : la ligne est désormais historique (amorcée), mais
    // le masquage doit s'appliquer exactement comme avant — c'est même là qu'il compte le plus,
    // puisque ces lignes ne peuvent plus être supprimées en les recréant proprement ailleurs.
    const list = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts`, { headers: authHeaders(tokenOwner) });
    expect(list.status).toBe(200);
    const accounts = (await list.json()) as { id: string; iban: string }[];
    const masked = accounts.find((account) => account.id === legacyMaskedBankAccountId);

    expect(masked, "le compte historique reste listé").toBeDefined();
    expect(masked!.iban).not.toBe("FR7630006000011234567890189");
    expect(masked!.iban.endsWith("0189")).toBe(true);
    expect(masked!.iban).toContain("•");
    // La donnée complète, elle, n'a pas été tronquée en base : le masquage est un fait de présentation.
    expect((await prisma.companyBankAccount.findUnique({ where: { id: legacyMaskedBankAccountId } }))?.iban).toBe("FR7630006000011234567890189");
  });

  it("un compte bancaire est archivé, jamais physiquement supprimé, et reste listé", async () => {
    // L'ARCHIVAGE reste ouvert après I.1 alors que création et mise à jour sont retirées : il ne fait
    // naître aucune donnée de candidature et n'altère aucune valeur — il retire une ligne historique
    // de l'usage actif, donc va DANS le sens du décommissionnement. Le refuser aurait rendu les
    // lignes Legacy définitivement inneutralisables depuis leur seule surface de gestion.
    const before = await prisma.companyBankAccount.findUnique({ where: { id: legacyArchivableBankAccountId } });
    expect(before?.status).toBe("ACTIVE");

    const archive = await fetch(`${baseUrl}/api/v1/clients/${secondClientAccountId}/bank-accounts/${legacyArchivableBankAccountId}/archive`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
    });
    expect(archive.status).toBe(200);
    expect(((await archive.json()) as { status: string }).status).toBe("ARCHIVED");

    const stillInDb = await prisma.companyBankAccount.findUnique({ where: { id: legacyArchivableBankAccountId } });
    expect(stillInDb, "archiver ne supprime jamais la ligne").not.toBeNull();
    expect(stillInDb?.status).toBe("ARCHIVED");
  });

  it("correctif audit Codex P0 — a CLIENT_MANAGER authorized on Client A cannot mutate a Client B resource of the SAME org by supplying its id under Client A's route", async () => {
    // Compte bancaire HISTORIQUE du Client B (`secondClientAccountId`), auquel clientManagerA n'a
    // AUCUNE affectation. Amorcé en base plutôt que créé par HTTP : la régression visée porte sur
    // le contrôle d'accès de la mutation, pas sur la façon dont la ligne est apparue.
    const attack = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/bank-accounts/${legacyClientBBankAccountId}/archive`, {
      method: "POST",
      headers: authHeaders(tokenClientManagerA),
    });
    expect(attack.status).toBe(404);

    const stillActive = await prisma.companyBankAccount.findUnique({ where: { id: legacyClientBBankAccountId } });
    expect(stillActive?.status).toBe("ACTIVE");
    expect(stillActive?.clientAccountId).toBe(secondClientAccountId);
  });

  it("cross-organization access to a ClientAccount returns 404, never leaking its existence", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${otherOrgClientAccountId}/legal-identity`, { headers: authHeaders(tokenOwner, orgId) });
    expect(res.status).toBe(404);
  });

  it("GET .../profile aggregates satellites and computes a per-category completeness — never a single commercial score", async () => {
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/profile`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as { completeness: Record<string, string> };
    expect(profile.completeness.identity).toBe("COMPLETE");
    expect(profile.completeness.banking).toBe("COMPLETE");
    expect(profile.completeness.references).toBe("MISSING");
    expect(Object.keys(profile.completeness)).not.toContain("score");
  });
});
