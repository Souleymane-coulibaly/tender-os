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
 * Checkpoint TENDEROS-2.1-CCV2-E.4 — deux preuves ciblées :
 *
 * 1. CROSS_DOCUMENT_CONSISTENCY — l'identité RÉELLEMENT produite dans DC1, DC2, DC4 et l'Acte
 *    d'engagement provient d'une seule et même `CandidateCompany`. Les valeurs sont extraites des
 *    routes de readiness (le contenu effectivement résolu pour le formulaire), jamais lues dans un
 *    mapper ni déduites d'un `candidateCompanyId` : c'est le CONTENU qui est vérifié.
 *
 * 2. TENANT_ISOLATION sur les trois surfaces restantes — Acte d'engagement, Response Package,
 *    Submission — avec en-tête normal ET en-tête forgé, plus une vérification en base qu'aucune
 *    mutation cross-tenant n'a été créée.
 *
 * Les sentinelles ALPHA/BETA sont uniques dans toute la base : chaque assertion d'absence est
 * doublée d'un témoin positif, sans quoi elle serait satisfaite par un artefact vide.
 */
describe("CCV2-E.4 — identité inter-documents et isolation tenant (HTTP + PostgreSQL réels)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let membershipRepository: PrismaMembershipRepository;

  const orgA = randomUUID();
  const orgB = randomUUID();
  const userIds: string[] = [];

  let tokenA: string;
  let userA: string;
  let tokenB: string;

  let clientX: string;
  let tenderId: string;
  let candidateA: string;
  let candidateB: string;
  let subcontractorDeclarationId: string;
  let engagementActId: string;
  let responsePackageId: string;

  // --- Sentinelles ALPHA (Candidate A) : uniques, recherchées littéralement dans les artefacts B.
  const A_LEGAL_NAME = "ALPHA CCV2 E4 SAS";
  const A_SIREN = "356000000";
  const A_SIRET = "35600000000048";
  const A_ADDRESS = "12 rue ALPHA CCV2 E4";
  const A_CITY = "AlphaVille";
  const A_SIGNATORY_EMAIL = "signataire-alpha-ccv2e4@alpha.test";
  const A_SIGNATORY_PHONE = "+33100000001";

  // --- Sentinelles BETA (Candidate B).
  const B_LEGAL_NAME = "BETA CCV2 E4 SAS";
  const B_SIREN = "393953851";
  const B_SIRET = "39395385100010";
  const B_ADDRESS = "34 avenue BETA CCV2 E4";
  const B_CITY = "BetaVille";
  const B_SIGNATORY_EMAIL = "signataire-beta-ccv2e4@beta.test";
  const B_SIGNATORY_PHONE = "+33200000002";

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const r = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "CCV2-E4", termsAccepted: true }),
    });
    const user = (await r.json()) as { id: string };
    const l = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { userId: user.id, token: ((await l.json()) as { accessToken: string }).accessToken };
  }

  function headers(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  /** Crée une CandidateCompany COMPLÈTE : identité, établissement principal, représentant. */
  async function seedCandidate(input: {
    legalName: string;
    siren: string;
    siret: string;
    addressLine: string;
    city: string;
    signatoryEmail: string;
    signatoryPhone: string;
  }): Promise<string> {
    const id = randomUUID();
    await prisma.candidateCompany.create({
      data: {
        id,
        organizationId: orgA,
        name: input.legalName,
        nameNormalized: `${input.legalName}-${id}`.toLowerCase(),
        legalName: input.legalName,
        tradeName: input.legalName,
        siren: input.siren,
        legalForm: "SAS",
        status: "ACTIVE",
        createdBy: userA,
      },
    });
    await prisma.candidateEstablishment.create({
      data: { id: randomUUID(), organizationId: orgA, candidateCompanyId: id, siret: input.siret, isPrincipal: true, addressLine: input.addressLine, postalCode: "75001", city: input.city, country: "FR", createdBy: userA },
    });
    await prisma.companyRepresentative.create({
      data: {
        id: randomUUID(),
        organizationId: orgA,
        clientAccountId: null,
        candidateCompanyId: id,
        firstName: "Contact",
        lastName: input.legalName,
        type: "ADMINISTRATIVE_CONTACT",
        email: input.signatoryEmail,
        phone: input.signatoryPhone,
        createdBy: userA,
      },
    });
    return id;
  }

  type FieldMap = Record<string, string | undefined>;

  /** Extrait les valeurs RÉELLEMENT résolues pour un formulaire officiel. */
  async function readFormFields(url: string): Promise<{ status: number; fields: FieldMap; raw: string }> {
    const res = await fetch(url, { headers: headers(tokenA, orgA) });
    const raw = await res.text();
    if (res.status !== 200) return { status: res.status, fields: {}, raw };
    const body = JSON.parse(raw) as { fields: { fieldKey: string; value?: string }[] };
    const fields: FieldMap = {};
    for (const field of body.fields) fields[field.fieldKey] = field.value;
    return { status: res.status, fields, raw };
  }

  async function readDc1() {
    return readFormFields(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc1/readiness`);
  }
  async function readDc2() {
    return readFormFields(`${baseUrl}/api/v1/tenders/${tenderId}/official-forms/dc2/candidate/readiness`);
  }
  async function readDc4() {
    return readFormFields(`${baseUrl}/api/v1/subcontractor-declarations/${subcontractorDeclarationId}/official-forms/dc4/readiness`);
  }
  async function readEngagementAct(): Promise<{ status: number; raw: string; body: Record<string, unknown> }> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { headers: headers(tokenA, orgA) });
    const raw = await res.text();
    return { status: res.status, raw, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} };
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

    await prisma.organization.create({ data: { id: orgA, name: "E4 A", slug: `e4-a-${orgA}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    await prisma.organization.create({ data: { id: orgB, name: "E4 B", slug: `e4-b-${orgB}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });
    // Droit commercial requis par `EnsureEngagementActUseCase` (402 sinon) — abonnement ACTIF, même
    // provisionnement que les specs Submission/AO déjà certifiées. Jamais un contournement
    // d'`EntitlementService`, jamais un Pass fabriqué.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgA, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgB, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const a = await registerAndLogin(`e4-a-${randomUUID()}@smoke.test`);
    userIds.push(a.userId);
    tokenA = a.token;
    userA = a.userId;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgA, userId: userA, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );
    const b = await registerAndLogin(`e4-b-${randomUUID()}@smoke.test`);
    userIds.push(b.userId);
    tokenB = b.token;
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgB, userId: b.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    clientX = randomUUID();
    await prisma.clientAccount.create({ data: { id: clientX, organizationId: orgA, name: "Client X E4", nameNormalized: `client-x-e4-${clientX}`, status: "ACTIVE", createdBy: userA } });

    candidateA = await seedCandidate({ legalName: A_LEGAL_NAME, siren: A_SIREN, siret: A_SIRET, addressLine: A_ADDRESS, city: A_CITY, signatoryEmail: A_SIGNATORY_EMAIL, signatoryPhone: A_SIGNATORY_PHONE });
    candidateB = await seedCandidate({ legalName: B_LEGAL_NAME, siren: B_SIREN, siret: B_SIRET, addressLine: B_ADDRESS, city: B_CITY, signatoryEmail: B_SIGNATORY_EMAIL, signatoryPhone: B_SIGNATORY_PHONE });

    tenderId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgA, clientAccountId: clientX, candidateCompanyId: candidateA, title: "Marché CCV2-E4", status: "IN_ANALYSIS", tags: [], createdBy: userA },
    });

    // Déclaration de sous-traitance : support du DC4 (`titulaire.*` = l'entreprise candidate).
    subcontractorDeclarationId = randomUUID();
    await prisma.subcontractorDeclaration.create({
      data: {
        id: subcontractorDeclarationId,
        organizationId: orgA,
        tenderId,
        subcontractorName: "Sous-traitant E4",
        servicesDescription: "Prestations de test CCV2-E4",
        amountValue: "1000.00",
        amountCurrency: "EUR",
        createdBy: userA,
      },
    });

    // Acte d'engagement renseigné SOUS LE CANDIDAT A -> instantané A.
    const ensureRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({}) });
    expect([200, 201]).toContain(ensureRes.status);
    engagementActId = ((await ensureRes.json()) as { id: string }).id;
    const patchRes = await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${engagementActId}`, {
      method: "PATCH",
      headers: headers(tokenA, orgA),
      body: JSON.stringify({ signatoryName: `Signataire ${A_LEGAL_NAME}`, signatoryCapacity: "Gérant" }),
    });
    expect(patchRes.status).toBe(200);

    // Response Package (support de la preuve tenant).
    const rpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: headers(tokenA, orgA), body: JSON.stringify({}) });
    expect(rpRes.status).toBe(201);
    responsePackageId = ((await rpRes.json()) as { id: string }).id;
  }, 180000);

  afterAll(async () => {
    for (const organizationId of [orgA, orgB]) {
      await prisma.organizationSubscription.deleteMany({ where: { organizationId } });
      await prisma.engagementAct.deleteMany({ where: { organizationId } });
      await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId } });
      await prisma.responsePackageVersion.deleteMany({ where: { organizationId } });
      await prisma.responsePackage.deleteMany({ where: { organizationId } });
      await prisma.tender.deleteMany({ where: { organizationId } });
      await prisma.companyRepresentative.deleteMany({ where: { organizationId } });
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

  describe("CROSS_DOCUMENT_IDENTITY — contenu réellement produit", () => {
    it("MATRICE A — DC1, DC2, DC4 et l'Acte portent tous l'identité de Candidate A, jamais celle du client commercial", async () => {
      const [dc1, dc2, dc4, act] = await Promise.all([readDc1(), readDc2(), readDc4(), readEngagementAct()]);

      expect(dc1.status).toBe(200);
      expect(dc2.status).toBe(200);
      expect(dc4.status).toBe(200);
      expect(act.status).toBe(200);

      // --- Témoins POSITIFS : chaque document porte bien A.
      expect(dc1.fields["candidate.tradeName"]).toBe(A_LEGAL_NAME);
      expect(dc1.fields["candidate.siret"]).toBe(A_SIRET);
      expect(dc1.fields["candidate.address"]).toContain(A_ADDRESS);
      expect(dc1.fields["candidate.email"]).toBe(A_SIGNATORY_EMAIL);
      expect(dc1.fields["candidate.phone"]).toBe(A_SIGNATORY_PHONE);

      expect(dc2.fields["candidate.tradeName"]).toBe(A_LEGAL_NAME);
      expect(dc2.fields["candidate.siret"]).toBe(A_SIRET);
      expect(dc2.fields["candidate.email"]).toBe(A_SIGNATORY_EMAIL);

      expect(dc4.fields["titulaire.tradeName"]).toBe(A_LEGAL_NAME);
      expect(dc4.fields["titulaire.siret"]).toBe(A_SIRET);
      expect(dc4.fields["titulaire.email"]).toBe(A_SIGNATORY_EMAIL);

      expect(act.body.candidateCompanyId).toBe(candidateA);
      expect(act.body.signatoryName).toBe(`Signataire ${A_LEGAL_NAME}`);
      expect(act.body.candidateStale).toBe(false);

      // --- Aucune sentinelle BETA ne peut apparaître dans les artefacts A.
      for (const raw of [dc1.raw, dc2.raw, dc4.raw, act.raw]) {
        expect(raw).not.toContain(B_LEGAL_NAME);
        expect(raw).not.toContain(B_SIRET);
        expect(raw).not.toContain(B_SIGNATORY_EMAIL);
      }
    }, 120000);

    it("MATRICE B + ALPHA_SENTINEL_SCAN_B — après le switch officiel, aucun artefact B ne contient la moindre sentinelle A", async () => {
      const switchRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/candidate-company`, {
        method: "POST",
        headers: headers(tokenA, orgA),
        body: JSON.stringify({ candidateCompanyId: candidateB }),
      });
      expect(switchRes.status).toBe(200);

      const [dc1, dc2, dc4, act] = await Promise.all([readDc1(), readDc2(), readDc4(), readEngagementAct()]);

      // --- Témoins POSITIFS : les trois formulaires sont recalculés sur B.
      expect(dc1.fields["candidate.tradeName"]).toBe(B_LEGAL_NAME);
      expect(dc1.fields["candidate.siret"]).toBe(B_SIRET);
      expect(dc1.fields["candidate.address"]).toContain(B_ADDRESS);
      expect(dc1.fields["candidate.email"]).toBe(B_SIGNATORY_EMAIL);
      expect(dc1.fields["candidate.phone"]).toBe(B_SIGNATORY_PHONE);

      expect(dc2.fields["candidate.tradeName"]).toBe(B_LEGAL_NAME);
      expect(dc2.fields["candidate.siret"]).toBe(B_SIRET);
      expect(dc2.fields["candidate.email"]).toBe(B_SIGNATORY_EMAIL);

      expect(dc4.fields["titulaire.tradeName"]).toBe(B_LEGAL_NAME);
      expect(dc4.fields["titulaire.siret"]).toBe(B_SIRET);
      expect(dc4.fields["titulaire.email"]).toBe(B_SIGNATORY_EMAIL);

      // --- ALPHA_SENTINEL_SCAN_B : recherche NÉGATIVE littérale dans le contenu produit.
      const alphaSentinels = [A_LEGAL_NAME, A_SIREN, A_SIRET, A_ADDRESS, A_CITY, A_SIGNATORY_EMAIL, A_SIGNATORY_PHONE];
      for (const [name, raw] of [["DC1", dc1.raw], ["DC2", dc2.raw], ["DC4", dc4.raw]] as const) {
        for (const sentinel of alphaSentinels) {
          expect(`${name}:${raw.includes(sentinel) ? "FUITE" : "propre"}`).toBe(`${name}:propre`);
        }
      }

      // --- L'Acte, lui, RESTE historiquement A et se déclare périmé : c'est le contrat CCV2-E.2,
      //     pas une fuite. Il ne doit simplement plus être applicable au dossier courant.
      expect(act.body.candidateCompanyId).toBe(candidateA);
      expect(act.body.candidateStale).toBe(true);
      expect(act.body.signatoryName).toBe(`Signataire ${A_LEGAL_NAME}`);
    }, 120000);
  });

  describe("TENANT_ISOLATION — Acte, Response Package, Submission", () => {
    it("Org B ne lit ni ne mute l'Acte d'engagement d'Org A, ni avec son en-tête, ni avec un en-tête forgé", async () => {
      const before = await prisma.engagementAct.findUnique({ where: { id: engagementActId } });

      // T-1 : acteur Org B + en-tête Org B — le Tender d'Org A n'existe pas pour lui.
      const own = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { headers: headers(tokenB, orgB) });
      expect(own.status).toBe(404);
      expect(await own.clone().text()).not.toContain(`Signataire ${A_LEGAL_NAME}`);

      // T-2 : en-tête FORGÉ vers Org A — rejeté par le guard d'appartenance.
      const forged = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-engagement-act`, { headers: headers(tokenB, orgA) });
      expect(forged.status).toBe(404);
      expect(((await forged.json()) as { error: { code: string } }).error.code).toBe("ORGANIZATION_ACCESS_DENIED");

      // T-3 : mutation depuis Org B — refusée, avec en-tête normal ET forgé.
      for (const h of [headers(tokenB, orgB), headers(tokenB, orgA)]) {
        const mutation = await fetch(`${baseUrl}/api/v1/administrative-engagement-acts/${engagementActId}`, {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ signatoryName: "PIRATE E4" }),
        });
        expect(mutation.status).toBeGreaterThanOrEqual(400);
      }

      // Aucune mutation créée en base.
      const after = await prisma.engagementAct.findUnique({ where: { id: engagementActId } });
      expect(after).toEqual(before);
      expect(await prisma.engagementAct.count({ where: { signatoryName: "PIRATE E4" } })).toBe(0);
    }, 120000);

    it("Org B ne lit ni ne mute le Response Package d'Org A", async () => {
      const before = await prisma.responsePackage.findUnique({ where: { id: responsePackageId } });

      for (const [label, h] of [["en-tête Org B", headers(tokenB, orgB)], ["en-tête forgé Org A", headers(tokenB, orgA)]] as const) {
        const read = await fetch(`${baseUrl}/api/v1/response-packages/${responsePackageId}`, { headers: h });
        expect({ label, status: read.status }).toMatchObject({ status: 404 });
        expect(await read.clone().text()).not.toContain(tenderId);

        const build = await fetch(`${baseUrl}/api/v1/response-packages/${responsePackageId}/build`, { method: "POST", headers: h });
        expect(build.status).toBeGreaterThanOrEqual(400);
      }

      expect(await prisma.responsePackage.findUnique({ where: { id: responsePackageId } })).toEqual(before);
      // Aucune version n'a pu être créée par Org B.
      expect(await prisma.responsePackageVersion.count({ where: { organizationId: orgB } })).toBe(0);
    }, 120000);

    it("Org B ne lit ni ne crée de Submission sur le Tender d'Org A", async () => {
      for (const h of [headers(tokenB, orgB), headers(tokenB, orgA)]) {
        const read = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, { headers: h });
        expect(read.status).toBe(404);
        expect(await read.clone().text()).not.toContain(responsePackageId);

        const create = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ packageId: responsePackageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
        });
        expect(create.status).toBeGreaterThanOrEqual(400);
      }

      // CROSS_TENANT_DATA_EXPOSURE = 0 : aucune soumission n'existe, ni pour A ni pour B.
      expect(await prisma.tenderSubmission.count({ where: { organizationId: orgB } })).toBe(0);
      expect(await prisma.tenderSubmission.count({ where: { tenderId } })).toBe(0);
    }, 120000);
  });
});
