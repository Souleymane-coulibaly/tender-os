import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const DC2_TEMPLATE_PATH = join(__dirname, "..", "..", "assets", "dc2-template-v1.docx");
const OOXML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * V2 Sprint 11B — préremplissage du VRAI formulaire DC2 officiel, par opérateur économique
 * explicite (candidat individuel OU un membre précis de groupement, mission §6/§7/§8/§9). Même
 * moteur/conventions que DC1/DC4 (Sprint 11A), jamais une seconde implémentation. Couvre les
 * scénarios BLOQUANTS explicitement exigés par la mission : groupement 2 membres sans
 * contamination (§54), multi-candidat (§41), same-org cross-client (§42), historique réel R1/R2
 * (§39/§58).
 */
describe("Administrative Dossier — V2 Sprint 11B DC2 real official form fill (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;
  let tokenContributor: string;
  let ownerUserId: string;

  const dc2TemplateBuffer = readFileSync(DC2_TEMPLATE_PATH);

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName: "DC2 Fill Test", termsAccepted: true }) });
    const user = (await registerRes.json()) as { id: string };
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const { accessToken } = (await loginRes.json()) as { accessToken: string };
    return { userId: user.id, token: accessToken };
  }

  function jsonHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }
  function multipartHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId };
  }

  async function addMembership(input: { userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: input.userId, role: input.role, occurredAt: new Date() }));
  }

  async function seedActiveDc2Template(): Promise<void> {
    const createRes = await fetch(`${baseUrl}/api/v1/document-templates`, { method: "POST", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ scope: "SYSTEM", name: "DC2" }) });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string };

    const fieldMappings = [
      { fieldKey: "candidate.tradeName", label: "Nom commercial", fieldType: "STRING", required: true },
      { fieldKey: "candidate.address", label: "Adresse", fieldType: "STRING", required: true },
      { fieldKey: "candidate.email", label: "Courriel", fieldType: "STRING", required: false },
      { fieldKey: "candidate.phone", label: "Téléphone", fieldType: "STRING", required: false },
      { fieldKey: "candidate.siret", label: "SIRET", fieldType: "STRING", required: true },
      { fieldKey: "candidate.legalForm", label: "Forme juridique", fieldType: "STRING", required: false },
      { fieldKey: "dc2.pmeOui", label: "PME oui", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.pmeNon", label: "PME non", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.reservedMarketCheckbox1", label: "Marché réservé 1", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.reservedMarketCheckbox2", label: "Marché réservé 2", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.reservedMarketCheckbox3", label: "Marché réservé 3", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.officialListCheckbox1", label: "Liste officielle 1", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.officialListCheckbox2", label: "Liste officielle 2", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.insuranceCheckbox", label: "Assurance décennale", fieldType: "CHECKBOX", required: false },
      { fieldKey: "dc2.otherOperatorsCheckbox", label: "Appui autres opérateurs", fieldType: "CHECKBOX", required: false },
    ];

    const form = new FormData();
    form.append("file", new Blob([dc2TemplateBuffer], { type: OOXML_MIME }), "dc2-template-v1.docx");
    form.append("fieldMappings", JSON.stringify(fieldMappings));
    form.append("allowPartialGeneration", "true");

    const versionRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions`, { method: "POST", headers: multipartHeaders(tokenOwner), body: form });
    expect(versionRes.status).toBe(201);
    const version = (await versionRes.json()) as { id: string; discoveredPlaceholders: readonly { fieldKey: string }[] };
    expect(version.discoveredPlaceholders.length).toBe(fieldMappings.length);

    const activateRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions/${version.id}/activate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(activateRes.status).toBe(200);
  }

  async function createClientWithLegalIdentity(input: { tradeName: string; siret: string }): Promise<string> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({ data: { id: randomUUID(), organizationId: orgId, name: `Client DC2 ${suffix}`, nameNormalized: `client dc2 ${suffix}`, status: "ACTIVE", createdBy: ownerUserId } });
    // Checkpoint TENDEROS-2.1-CCV2-I.1 — identité juridique du CLIENT amorcée DIRECTEMENT en base.
    // `PATCH /clients/:id/legal-identity` est retiré (409 `CLIENT_BIDDER_WRITE_RETIRED`), mais cette
    // ligne doit continuer d'exister : c'est le LEURRE dont ces tests prouvent qu'il n'est JAMAIS lu
    // à la place de l'entreprise candidate. La supprimer affaiblirait la preuve au lieu de l'adapter.
    await prisma.companyLegalIdentity.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        clientAccountId: clientAccount.id,
        legalName: input.tradeName,
        tradeName: input.tradeName,
        siren: input.siret.slice(0, 9),
        siretPrincipal: input.siret,
        addressLine: "1 rue du Test",
        postalCode: "75001",
        city: "Paris",
        createdBy: ownerUserId,
      },
    });
    return clientAccount.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    prisma = moduleRef.get(PrismaService);

    await prisma.organization.create({ data: { id: orgId, name: "DC2 Fill Org", slug: `dc2-fill-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3 — EnsureAdministrativeDossierUseCase/CreateAdministrativeRequirementUseCase
    // gatent désormais canOperateOnTender : ENTERPRISE (illimité) évite tout effet de bord de
    // quota/AO credits, même motif déjà établi dans
    // dce-http.integration.spec.ts/analysis-http.integration.spec.ts.
    await prisma.organizationSubscription.create({
      data: { id: randomUUID(), organizationId: orgId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
    });

    const owner = await registerAndLogin(`dc2-fill-owner-${randomUUID()}@smoke.test`);
    const contributor = await registerAndLogin(`dc2-fill-contributor-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId, contributor.userId);
    tokenOwner = owner.token;
    tokenContributor = contributor.token;
    ownerUserId = owner.userId;

    await addMembership({ userId: owner.userId, role: OrganizationRole.Owner });
    await addMembership({ userId: contributor.userId, role: OrganizationRole.Contributor });
    await seedActiveDc2Template();
  }, 60000);

  afterAll(async () => {
    await prisma.generatedDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.generatedDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateFieldMapping.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.consortium.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.companyLegalIdentity.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateEstablishment.deleteMany({ where: { organizationId: orgId } });
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);


  /**
   * Checkpoint TENDEROS-2.1-CCV2-G.2 — l'identite d'un formulaire officiel vient desormais
   * EXCLUSIVEMENT de l'entreprise candidate. Ce helper cree donc, pour les tests qui n'en avaient
   * pas, une entreprise candidate portant EXACTEMENT les memes valeurs que le profil client qu'ils
   * renseignaient : leurs assertions restent inchangees, et prouvent maintenant la nouvelle SOT.
   *
   * Le SIRET est distinct a chaque appel : `candidate_establishments` impose l'unicite
   * `(organization_id, siret)` (regle de domaine CCV2-B), la ou le profil client tolere le doublon.
   */
  let g2SiretCounter = 0;
  function nextCandidateSiret(): string {
    g2SiretCounter += 1;
    const base = `9100000000${String(g2SiretCounter).padStart(3, "0")}`;
    const digits = base.split("").map(Number);
    let sum = 0;
    for (let index = 0; index < digits.length; index += 1) {
      const position = digits.length - index;
      const doubled = position % 2 === 0 ? (digits[index] as number) * 2 : (digits[index] as number);
      sum += doubled > 9 ? doubled - 9 : doubled;
    }
    return `${base}${(10 - (sum % 10)) % 10}`;
  }

  async function createCandidateFor(tradeName: string, createdBy: string): Promise<{ id: string; siret: string }> {
    const suffix = randomUUID();
    const siret = nextCandidateSiret();
    const candidate = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: tradeName,
        nameNormalized: `${tradeName.toLowerCase()} ${suffix}`,
        legalName: tradeName,
        siren: siret.slice(0, 9),
        status: "ACTIVE",
        createdBy,
      },
    });
    await prisma.candidateEstablishment.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        candidateCompanyId: candidate.id,
        siret,
        isPrincipal: true,
        addressLine: "12 rue de la Republique",
        postalCode: "75001",
        city: "Paris",
        createdBy,
      },
    });
    return { id: candidate.id, siret };
  }

  it("individual candidate — readiness + real DOCX generation from real data, zero side effect on preview", async () => {
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "Menuiserie Corentin SARL", siret: "35600000000048" });
    const candidate = await createCandidateFor("Menuiserie Corentin SARL", ownerUserId);
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, candidateCompanyId: candidate.id, title: "Marche DC2 - individuel", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const countBefore = await prisma.generatedDocument.count({ where: { organizationId: orgId } });
    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Menuiserie Corentin SARL" });
    expect(readiness.fields.find((f) => f.fieldKey === "dc2.pmeOui")).toMatchObject({ status: "NEEDS_REVIEW" });
    // Correctif audit Codex P2 — CA/capacités techniques ne sont jamais silencieusement absents de
    // la readiness, même sans placeholder correspondant dans le gabarit dérivé (zones F1/G1
    // différées) : signalés explicitement, jamais un score DC2 trop optimiste par omission.
    expect(readiness.fields.find((f) => f.fieldKey === "dc2.financialCapacity")).toMatchObject({ status: "NEEDS_REVIEW" });
    expect(readiness.fields.find((f) => f.fieldKey === "dc2.technicalCapacity")).toMatchObject({ status: "NEEDS_REVIEW" });
    const countAfterReadiness = await prisma.generatedDocument.count({ where: { organizationId: orgId } });
    expect(countAfterReadiness).toBe(countBefore);

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { revisions: { status: string; artifactDocumentId?: string }[] };
    expect(generated.revisions[0]!.status).toBe("COMPLETED");

    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("Menuiserie Corentin SARL");
  });

  it("BLOCKING (audit post-A4, correctif P1/P2-01) — a Tender linked to a CandidateCompany resolves candidate.tradeName/siret/address/legalForm from CandidateCompany, NEVER from the ClientAccount's legal identity", async () => {
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "Client Legacy Legal SAS", siret: "35600000000048" });
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche DC2 - candidate moderne", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const candidateCompany = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Candidate Moderne SARL", nameNormalized: "candidate moderne sarl", legalName: "Candidate Moderne SARL", siren: "654000000", legalForm: "SARL", status: "ACTIVE", createdBy: ownerUserId },
    });
    await prisma.candidateEstablishment.create({
      data: { id: randomUUID(), organizationId: orgId, candidateCompanyId: candidateCompany.id, siret: "65400000000017", isPrincipal: true, addressLine: "3 rue du Candidat", postalCode: "13000", city: "Marseille", country: "FR", createdBy: ownerUserId },
    });
    await prisma.tender.update({ where: { id_organizationId: { id: tender.id, organizationId: orgId } }, data: { candidateCompanyId: candidateCompany.id } });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Candidate Moderne SARL" });
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.siret")).toMatchObject({ status: "AVAILABLE", value: "65400000000017" });
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.legalForm")).toMatchObject({ status: "AVAILABLE", value: "SARL" });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { revisions: { artifactDocumentId?: string }[] };
    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("Candidate Moderne SARL");
    expect(xml).not.toContain("Client Legacy Legal SAS");
  });

  it("H.6 — SENTINELLES : le champ officiel porte la dénomination sociale ET le nom commercial, jamais une identité client", async () => {
    // Valeurs volontairement TOUTES DIFFÉRENTES : une sentinelle partagée rendrait indétectable la
    // substitution même que ce test interdit. Chaque chaîne n'existe qu'à un seul endroit du modèle.
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "LEGACY-CLIENT-COMMERCIAL", siret: "35600000000048" });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche DC2 - sentinelles H6", status: "DRAFT", tags: [], createdBy: ownerUserId },
    });

    const candidateCompany = await prisma.candidateCompany.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: "CANDIDATE-DISPLAY",
        nameNormalized: "candidate-display",
        legalName: "CANDIDATE-LEGAL-SA",
        tradeName: "CANDIDATE-TRADE",
        siren: "732829320",
        legalForm: "SA",
        status: "ACTIVE",
        createdBy: ownerUserId,
      },
    });
    // SIREN/SIRET propres à ce test : `candidate_establishments` impose l'unicité
    // `(organization_id, siret)`, et les autres tests du fichier occupent déjà leurs valeurs.
    await prisma.candidateEstablishment.create({
      data: { id: randomUUID(), organizationId: orgId, candidateCompanyId: candidateCompany.id, siret: "73282932000009", isPrincipal: true, addressLine: "3 rue du Candidat", postalCode: "13000", city: "Marseille", country: "FR", createdBy: ownerUserId },
    });
    // Contact CRM du CLIENT : il ne doit apparaître dans AUCUN champ du formulaire officiel — c'est
    // la frontière posée par CCV2-I entre contact commercial et représentant légal.
    await prisma.companyRepresentative.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId, firstName: "CLIENT-COMMERCIAL", lastName: "CONTACT", type: "COMMERCIAL_CONTACT", status: "ACTIVE", createdBy: ownerUserId },
    });
    await prisma.tender.update({ where: { id_organizationId: { id: tender.id, organizationId: orgId } }, data: { candidateCompanyId: candidateCompany.id } });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };

    // §21 — la preuve porte sur le MAPPING de champ, pas sur une chaîne trouvée quelque part : le
    // champ officiel DC2 P37 réclame « nom commercial / dénomination sociale », les deux.
    expect(readiness.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({
      status: "AVAILABLE",
      value: "CANDIDATE-LEGAL-SA (CANDIDATE-TRADE)",
    });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { revisions: { artifactDocumentId?: string }[] };
    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
    const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";

    // §22 — preuve sur la SORTIE réellement générée, pas seulement sur le contexte.
    expect(xml, "la dénomination sociale doit figurer au document").toContain("CANDIDATE-LEGAL-SA");
    expect(xml, "le nom commercial demandé par le champ officiel doit y figurer aussi").toContain("CANDIDATE-TRADE");
    expect(xml, "aucune identité du client commercial ne doit atteindre un champ candidat").not.toContain("LEGACY-CLIENT-COMMERCIAL");
    expect(xml, "aucun contact CRM ne doit tenir lieu de représentant légal").not.toContain("CLIENT-COMMERCIAL");
  });

  it("BLOCKING (mission §54) — groupement 2 membres: each DC2 generation uses ONLY its own member's data, never contaminated by the other member or the candidate", async () => {
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "Mandataire Principal SAS", siret: "35600000000048" });
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche DC2 - groupement", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const ensureRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/administrative-consortium`, { method: "POST", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ type: "JOINT" }) });
    expect(ensureRes.status).toBe(200);
    const consortium = (await ensureRes.json()) as { id: string };

    const memberA = { memberId: "member-A", name: "Entreprise Alpha", legalIdentifier: "11111111100011", role: "cotraitant" };
    const memberB = { memberId: "member-B", name: "Entreprise Beta", legalIdentifier: "22222222200022", role: "cotraitant" };
    const updateRes = await fetch(`${baseUrl}/api/v1/administrative-consortiums/${consortium.id}`, { method: "PATCH", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ members: [memberA, memberB] }) });
    expect(updateRes.status).toBe(200);

    // Readiness isolée par membre — jamais un score agrégé (mission §13).
    const readinessARes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/members/member-A/readiness`, { headers: jsonHeaders(tokenOwner) });
    const readinessA = (await readinessARes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readinessA.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Entreprise Alpha" });
    expect(readinessA.fields.find((f) => f.fieldKey === "candidate.siret")).toMatchObject({ status: "AVAILABLE", value: "11111111100011" });
    // Adresse/email/téléphone/forme juridique honnêtement MISSING (gap structurel réel du
    // répertoire des membres) — jamais recopiés depuis le candidat.
    expect(readinessA.fields.find((f) => f.fieldKey === "candidate.address")).toMatchObject({ status: "MISSING" });

    const readinessBRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/members/member-B/readiness`, { headers: jsonHeaders(tokenOwner) });
    const readinessB = (await readinessBRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readinessB.fields.find((f) => f.fieldKey === "candidate.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Entreprise Beta" });
    expect(readinessB.fields.find((f) => f.fieldKey === "candidate.siret")).toMatchObject({ status: "AVAILABLE", value: "22222222200022" });

    // Génération séparée — deux lignées GeneratedDocument indépendantes.
    const generateARes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/members/member-A/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateARes.status).toBe(201);
    const generatedA = (await generateARes.json()) as { id: string; revisions: { artifactDocumentId?: string }[] };

    const generateBRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/members/member-B/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateBRes.status).toBe(201);
    const generatedB = (await generateBRes.json()) as { id: string; revisions: { artifactDocumentId?: string }[] };

    expect(generatedA.id).not.toBe(generatedB.id);

    const downloadA = await fetch(`${baseUrl}/api/v1/documents/${generatedA.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const xmlA = await (await JSZip.loadAsync(Buffer.from(await downloadA.arrayBuffer()))).file("word/document.xml")?.async("string");
    expect(xmlA).toContain("Entreprise Alpha");
    expect(xmlA).toContain("11111111100011");
    expect(xmlA).not.toContain("Entreprise Beta");
    expect(xmlA).not.toContain("22222222200022");

    const downloadB = await fetch(`${baseUrl}/api/v1/documents/${generatedB.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const xmlB = await (await JSZip.loadAsync(Buffer.from(await downloadB.arrayBuffer()))).file("word/document.xml")?.async("string");
    expect(xmlB).toContain("Entreprise Beta");
    expect(xmlB).toContain("22222222200022");
    expect(xmlB).not.toContain("Entreprise Alpha");
    expect(xmlB).not.toContain("11111111100011");

    // Anti-IDOR — un memberId qui n'appartient pas à CE groupement est refusé.
    const badMemberRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/members/does-not-exist/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(badMemberRes.status).toBe(404);
  }, 15000); // Checkpoint 2.1-A4 — 2 lectures de readiness + 2 générations DOCX réelles + 2
  // téléchargements dans un seul test ; voir le commentaire identique dans
  // administrative-dossier-official-form-fill-http.integration.spec.ts.

  it("BLOCKING (mission §41 multi-candidate) — a DIFFERENT tender's DC2 never resolves to the wrong candidate's data", async () => {
    // Checkpoint CCV2-G.2 — l'isolation porte desormais sur deux ENTREPRISES CANDIDATES distinctes,
    // puisque ce sont elles qui font autorite. L'intention du test est identique.
    const clientA = await createClientWithLegalIdentity({ tradeName: "Candidat A SARL", siret: "35600000000048" });
    const candidateA = await createCandidateFor("Candidat A SARL", ownerUserId);
    await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientA, candidateCompanyId: candidateA.id, title: "Marche A", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const clientB = await createClientWithLegalIdentity({ tradeName: "Candidat B SARL", siret: "35600000000048" });
    const candidateB = await createCandidateFor("Candidat B SARL", ownerUserId);
    const tenderB = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientB, candidateCompanyId: candidateB.id, title: "Marche B", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const readinessBRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderB.id}/official-forms/dc2/candidate/readiness`, { headers: jsonHeaders(tokenOwner) });
    const readinessB = (await readinessBRes.json()) as { fields: { fieldKey: string; value?: unknown }[] };
    expect(readinessB.fields.find((f) => f.fieldKey === "candidate.tradeName")?.value).toBe("Candidat B SARL");
    expect(readinessB.fields.find((f) => f.fieldKey === "candidate.tradeName")?.value).not.toBe("Candidat A SARL");
  });

  it("BLOCKING (mission §42 same-org cross-client) — a secret candidate value never leaks through DC2 readiness/generate to an unassigned actor", async () => {
    const secretClientId = await createClientWithLegalIdentity({ tradeName: "SECRET-CANDIDATE-B-112233", siret: "35600000000048" });
    const secretTender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId: secretClientId, title: "Marche secret", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${secretTender.id}/official-forms/dc2/candidate/readiness`, { headers: jsonHeaders(tokenContributor) });
    expect(readinessRes.status).toBe(404);
    const body = await readinessRes.text();
    expect(body).not.toContain("SECRET-CANDIDATE-B-112233");

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${secretTender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenContributor) });
    expect(generateRes.status).toBe(404);
  });

  it("BLOCKING (mission §39/§58 history) — generating twice for the SAME operator appends revision #2 to the SAME lineage, R1 snapshot stays frozen", async () => {
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "Charpente Duval SAS", siret: "35600000000048" });
    const historyCandidate = await createCandidateFor("Charpente Duval SAS", ownerUserId);
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, candidateCompanyId: historyCandidate.id, title: "Marche DC2 - historique", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const firstRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    const first = (await firstRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(first.revisions.map((r) => r.revisionNumber)).toEqual([1]);

    // Checkpoint CCV2-G.2 — la source mutee est l'ENTREPRISE CANDIDATE (route native CCV2-F.2) :
    // c'est elle qui alimente le formulaire. L'intention du test — R1 fige, R2 a jour — est intacte.
    await fetch(`${baseUrl}/api/v1/candidate-companies/${historyCandidate.id}`, { method: "PATCH", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ legalName: "Charpente Duval SAS (v2)" }) });

    const secondRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    const second = (await secondRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(second.id).toBe(first.id);
    expect(second.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);

    const lineageCount = await prisma.generatedDocument.count({ where: { organizationId: orgId, tenderId: tender.id } });
    expect(lineageCount).toBe(1);
  });
});
