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

const DC4_TEMPLATE_PATH = join(__dirname, "..", "..", "assets", "dc4-template-v1.docx");
const OOXML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * V2 Sprint 11 — préremplissage du VRAI formulaire DC4 officiel, même moteur/mêmes conventions que
 * la suite DC1 (`administrative-dossier-official-form-fill-http.integration.spec.ts`), jamais une
 * seconde implémentation. Correctif audit Codex : couvre désormais explicitement les champs
 * financiers/prestation (`servicesDescription`/`declaredAmount`/`durationMonths`) ajoutés après le
 * premier passage, et vérifie que `subcontractor.signatoryName` n'est JAMAIS auto-rempli depuis le
 * représentant légal du répertoire (`SubcontractorProfile.legalRepresentativeName`).
 */
describe("Administrative Dossier — V2 Sprint 11 DC4 real official form fill (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;

  const dc4TemplateBuffer = readFileSync(DC4_TEMPLATE_PATH);

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "DC4 Fill Test", termsAccepted: true }),
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

  async function seedActiveDc4Template(): Promise<void> {
    const createRes = await fetch(`${baseUrl}/api/v1/document-templates`, { method: "POST", headers: jsonHeaders(tokenOwner), body: JSON.stringify({ scope: "SYSTEM", name: "DC4" }) });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string };

    const fieldMappings = [
      { fieldKey: "tender.buyerIdentification", label: "Acheteur", fieldType: "STRING", required: true },
      { fieldKey: "tender.marketObject", label: "Objet du marché", fieldType: "STRING", required: true },
      { fieldKey: "titulaire.tradeName", label: "Nom du titulaire", fieldType: "STRING", required: true },
      { fieldKey: "titulaire.address", label: "Adresse du titulaire", fieldType: "STRING", required: true },
      { fieldKey: "titulaire.email", label: "Courriel du titulaire", fieldType: "STRING", required: false },
      { fieldKey: "titulaire.phone", label: "Téléphone du titulaire", fieldType: "STRING", required: false },
      { fieldKey: "titulaire.siret", label: "SIRET du titulaire", fieldType: "STRING", required: true },
      { fieldKey: "titulaire.legalForm", label: "Forme juridique du titulaire", fieldType: "STRING", required: false },
      { fieldKey: "subcontractor.tradeName", label: "Nom du sous-traitant", fieldType: "STRING", required: true },
      { fieldKey: "subcontractor.address", label: "Adresse du sous-traitant", fieldType: "STRING", required: true },
      { fieldKey: "subcontractor.email", label: "Courriel du sous-traitant", fieldType: "STRING", required: false },
      { fieldKey: "subcontractor.phone", label: "Téléphone du sous-traitant", fieldType: "STRING", required: false },
      { fieldKey: "subcontractor.siret", label: "SIRET du sous-traitant", fieldType: "STRING", required: true },
      { fieldKey: "subcontractor.legalForm", label: "Forme juridique du sous-traitant", fieldType: "STRING", required: false },
      { fieldKey: "subcontractor.signatoryName", label: "Signataire du sous-traitant", fieldType: "STRING", required: false },
      { fieldKey: "subcontractor.servicesDescription", label: "Prestations sous-traitées", fieldType: "STRING", required: true },
      { fieldKey: "subcontractor.declaredAmount", label: "Montant des prestations", fieldType: "STRING", required: true },
      { fieldKey: "subcontractor.durationMonths", label: "Durée (mois)", fieldType: "STRING", required: false },
    ];

    const form = new FormData();
    form.append("file", new Blob([dc4TemplateBuffer], { type: OOXML_MIME }), "dc4-template-v1.docx");
    form.append("fieldMappings", JSON.stringify(fieldMappings));
    form.append("allowPartialGeneration", "true");

    const versionRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions`, { method: "POST", headers: multipartHeaders(tokenOwner), body: form });
    expect(versionRes.status).toBe(201);
    const version = (await versionRes.json()) as { id: string; discoveredPlaceholders: readonly { fieldKey: string }[] };
    expect(version.discoveredPlaceholders.length).toBe(fieldMappings.length);

    const activateRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions/${version.id}/activate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(activateRes.status).toBe(200);
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

    await prisma.organization.create({ data: { id: orgId, name: "DC4 Fill Org", slug: `dc4-fill-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`dc4-fill-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    await addMembership({ userId: owner.userId, role: OrganizationRole.Owner });
    await seedActiveDc4Template();
  }, 60000);

  afterAll(async () => {
    await prisma.generatedDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.generatedDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateFieldMapping.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.subcontractorProfile.deleteMany({ where: { organizationId: orgId } });
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
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("readiness maps identity AND financial/prestation fields from real data, and never auto-fills the signatory from the legal representative", async () => {
    // Titulaire (l'entreprise candidate TenderOS elle-même).
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: `Client DC4 ${randomUUID()}`, nameNormalized: "client dc4", status: "ACTIVE", createdBy: userIds[0]! },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientAccount.id, title: "Marche DC4 - travaux", buyerName: "Commune de Test", status: "DRAFT", tags: [], createdBy: userIds[0]! },
    });
    const legalIdentityRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccount.id}/legal-identity`, {
      method: "PATCH",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Titulaire SAS", tradeName: "Titulaire SAS", siren: "356000000", siretPrincipal: "35600000000048", addressLine: "1 rue du Titulaire", postalCode: "75001", city: "Paris", confirmDuplicate: true }),
    });
    expect(legalIdentityRes.status).toBe(200);

    // Sous-traitant réutilisable (répertoire organisationnel).
    const profileRes = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Sous-Traitant SARL", tradeName: "Sous-Traitant SARL", siret: "35600000000048", addressLine: "2 rue du Sous-traitant", postalCode: "69001", city: "Lyon", legalRepresentativeName: "M. Dupont", contactEmail: "st@example.test" }),
    });
    expect(profileRes.status).toBe(201);
    const profile = (await profileRes.json()) as { id: string };

    const declarationRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/administrative-subcontractors`, {
      method: "POST",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({
        subcontractorName: "Sous-Traitant SARL",
        servicesDescription: "Travaux de peinture et revetements",
        amountValue: 8000,
        amountCurrency: "EUR",
        subcontractorProfileId: profile.id,
        durationMonths: 6,
      }),
    });
    expect(declarationRes.status).toBe(201);
    const declaration = (await declarationRes.json()) as { id: string };

    const readinessRes = await fetch(`${baseUrl}/api/v1/subcontractor-declarations/${declaration.id}/official-forms/dc4/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };

    // Correctif P1 (identité) — déjà couvert par la première passe.
    expect(readiness.fields.find((f) => f.fieldKey === "titulaire.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Titulaire SAS" });
    expect(readiness.fields.find((f) => f.fieldKey === "subcontractor.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Sous-Traitant SARL" });

    // Correctif P1 (audit) — champs financiers/prestation désormais réellement mappés.
    expect(readiness.fields.find((f) => f.fieldKey === "subcontractor.servicesDescription")).toMatchObject({ status: "AVAILABLE", value: "Travaux de peinture et revetements" });
    expect(readiness.fields.find((f) => f.fieldKey === "subcontractor.declaredAmount")).toMatchObject({ status: "AVAILABLE" });
    expect((readiness.fields.find((f) => f.fieldKey === "subcontractor.declaredAmount")!.value as string)).toContain("8");
    expect(readiness.fields.find((f) => f.fieldKey === "subcontractor.durationMonths")).toMatchObject({ status: "AVAILABLE", value: "6" });

    // Correctif P1 (audit) — jamais signataire = représentant légal auto-rempli.
    const signatoryField = readiness.fields.find((f) => f.fieldKey === "subcontractor.signatoryName");
    expect(signatoryField?.status).toBe("NEEDS_REVIEW");
    expect(signatoryField?.value).toBeUndefined();

    // Generate — produces the REAL DC4 DOCX with the real financial/prestation data, never the
    // legal-representative name silently used as signatory.
    const generateRes = await fetch(`${baseUrl}/api/v1/subcontractor-declarations/${declaration.id}/official-forms/dc4/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { tenderId: string; revisions: { status: string; artifactDocumentId?: string }[] };
    expect(generated.tenderId).toBe(tender.id);
    expect(generated.revisions[0]!.status).toBe("COMPLETED");

    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    expect(downloadRes.status).toBe(200);
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Travaux de peinture");
    expect(documentXml).not.toContain("M. Dupont");
  }, 15000); // Checkpoint 2.1-A4 (correctif post-audit) — prepare/profile/declaration/readiness/
  // generate/download dans un seul test, désormais dépassé par l'appel best-effort supplémentaire
  // à ResolveCandidateIdentityUseCase dans le résolveur DC4 (même discipline que la note identique
  // dans administrative-dossier-official-form-fill-http.integration.spec.ts).

  it("BLOCKING (audit post-A4, correctif P1/P2-01) — a Tender linked to a CandidateCompany resolves titulaire.tradeName/siret/address/legalForm from CandidateCompany, NEVER from the ClientAccount's legal identity", async () => {
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: orgId, name: `Client DC4 Moderne ${randomUUID()}`, nameNormalized: "client dc4 moderne", status: "ACTIVE", createdBy: userIds[0]! },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: orgId, clientAccountId: clientAccount.id, title: "Marche DC4 - candidate moderne", buyerName: "Commune de Test", status: "DRAFT", tags: [], createdBy: userIds[0]! },
    });
    const legalIdentityRes = await fetch(`${baseUrl}/api/v1/clients/${clientAccount.id}/legal-identity`, {
      method: "PATCH",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Client Legacy Legal SAS", tradeName: "Client Legacy Legal SAS", siren: "356000000", siretPrincipal: "35600000000048", addressLine: "1 rue du Titulaire", postalCode: "75001", city: "Paris", confirmDuplicate: true }),
    });
    expect(legalIdentityRes.status).toBe(200);

    const candidateCompany = await prisma.candidateCompany.create({
      data: { id: randomUUID(), organizationId: orgId, name: "Titulaire Moderne SAS", nameNormalized: "titulaire moderne sas", legalName: "Titulaire Moderne SAS", siren: "321000000", legalForm: "SAS", status: "ACTIVE", createdBy: userIds[0]! },
    });
    await prisma.candidateEstablishment.create({
      data: { id: randomUUID(), organizationId: orgId, candidateCompanyId: candidateCompany.id, siret: "32100000000014", isPrincipal: true, addressLine: "5 rue du Titulaire Moderne", postalCode: "44000", city: "Nantes", country: "FR", createdBy: userIds[0]! },
    });
    await prisma.tender.update({ where: { id_organizationId: { id: tender.id, organizationId: orgId } }, data: { candidateCompanyId: candidateCompany.id } });

    const profileRes = await fetch(`${baseUrl}/api/v1/subcontractor-profiles`, {
      method: "POST",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ legalName: "Sous-Traitant Moderne SARL", tradeName: "Sous-Traitant Moderne SARL", siret: "35600000000048", addressLine: "2 rue du Sous-traitant", postalCode: "69001", city: "Lyon", contactEmail: "st2@example.test", confirmDuplicate: true }),
    });
    expect(profileRes.status).toBe(201);
    const profile = (await profileRes.json()) as { id: string };

    const declarationRes = await fetch(`${baseUrl}/api/v1/tenders/${tender.id}/administrative-subcontractors`, {
      method: "POST",
      headers: jsonHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-Traitant Moderne SARL", servicesDescription: "Travaux electriques", amountValue: 5000, amountCurrency: "EUR", subcontractorProfileId: profile.id }),
    });
    expect(declarationRes.status).toBe(201);
    const declaration = (await declarationRes.json()) as { id: string };

    const readinessRes = await fetch(`${baseUrl}/api/v1/subcontractor-declarations/${declaration.id}/official-forms/dc4/readiness`, { headers: jsonHeaders(tokenOwner) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { fields: { fieldKey: string; status: string; value?: unknown }[] };
    expect(readiness.fields.find((f) => f.fieldKey === "titulaire.tradeName")).toMatchObject({ status: "AVAILABLE", value: "Titulaire Moderne SAS" });
    expect(readiness.fields.find((f) => f.fieldKey === "titulaire.siret")).toMatchObject({ status: "AVAILABLE", value: "32100000000014" });
    expect(readiness.fields.find((f) => f.fieldKey === "titulaire.legalForm")).toMatchObject({ status: "AVAILABLE", value: "SAS" });

    const generateRes = await fetch(`${baseUrl}/api/v1/subcontractor-declarations/${declaration.id}/official-forms/dc4/generate`, { method: "POST", headers: jsonHeaders(tokenOwner) });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { revisions: { artifactDocumentId?: string }[] };
    const downloadRes = await fetch(`${baseUrl}/api/v1/documents/${generated.revisions[0]!.artifactDocumentId}/download`, { headers: jsonHeaders(tokenOwner) });
    const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Titulaire Moderne SAS");
    expect(documentXml).not.toContain("Client Legacy Legal SAS");
  });
});
