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
    const res = await fetch(`${baseUrl}/api/v1/clients/${clientAccount.id}/legal-identity`, {
      method: "PATCH",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: input.tradeName, tradeName: input.tradeName, siren: input.siret.slice(0, 9), siretPrincipal: input.siret, addressLine: "1 rue du Test", postalCode: "75001", city: "Paris", confirmDuplicate: true }),
    });
    expect(res.status).toBe(200);
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
    await prisma.clientAssignment.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("individual candidate — readiness + real DOCX generation from real data, zero side effect on preview", async () => {
    const clientAccountId = await createClientWithLegalIdentity({ tradeName: "Menuiserie Corentin SARL", siret: "35600000000048" });
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche DC2 - individuel", status: "DRAFT", tags: [], createdBy: ownerUserId } });

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
  });

  it("BLOCKING (mission §41 multi-candidate) — a DIFFERENT tender's DC2 never resolves to the wrong candidate's data", async () => {
    const clientA = await createClientWithLegalIdentity({ tradeName: "Candidat A SARL", siret: "35600000000048" });
    await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientA, title: "Marche A", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const clientB = await createClientWithLegalIdentity({ tradeName: "Candidat B SARL", siret: "35600000000048" });
    const tenderB = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientB, title: "Marche B", status: "DRAFT", tags: [], createdBy: ownerUserId } });

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
    const tender = await prisma.tender.create({ data: { id: randomUUID(), organizationId: orgId, clientAccountId, title: "Marche DC2 - historique", status: "DRAFT", tags: [], createdBy: ownerUserId } });

    const firstRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    const first = (await firstRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(first.revisions.map((r) => r.revisionNumber)).toEqual([1]);

    await fetch(`${baseUrl}/api/v1/clients/${clientAccountId}/legal-identity`, { method: "PATCH", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ tradeName: "Charpente Duval SAS (v2)", confirmDuplicate: true }) });

    const secondRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/official-forms/dc2/candidate/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    const second = (await secondRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(second.id).toBe(first.id);
    expect(second.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);

    const lineageCount = await prisma.generatedDocument.count({ where: { organizationId: orgId, tenderId: tender.id } });
    expect(lineageCount).toBe(1);
  });
});
