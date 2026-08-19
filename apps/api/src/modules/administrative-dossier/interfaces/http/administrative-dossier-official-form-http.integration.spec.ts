import { createHash, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { buildMinimalDocx } from "../../../extraction/test-support/docx-fixture-builder";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

/**
 * Sprint 8C.1 — DC4 bout-en-bout : préparer -> brouillon -> aperçu -> générer l'Annexe TenderOS
 * (DOCX réel) -> valider. Vérifie l'invariant central de ce sprint : le formulaire officiel de
 * référence (stocké tel quel via le module Documents) reste OCTET POUR OCTET identique à l'original
 * après toutes ces opérations — jamais patché, jamais régénéré. Seule l'Annexe TenderOS, un document
 * SÉPARÉ, est produite par le moteur de rendu DOCX déjà utilisé par Export/Sprint 8A.
 *
 * Le "gabarit officiel" utilisé ici est un DOCX structurellement valide construit par
 * `buildMinimalDocx` (même convention que `extraction/test-support` — mission "jamais un fichier
 * binaire versionné ni un appel réseau dans les tests") plutôt que le vrai fichier DAJ téléchargé
 * hors-ligne pendant ce sprint : ce test vérifie le MÉCANISME (stockage intact, hash inchangé,
 * pipeline de génération de l'Annexe), pas le contenu du DC4 réel lui-même.
 */
describe("Administrative Dossier — Sprint 8C.1 DC4 official form (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const userIds: string[] = [];
  let tokenOwner: string;

  let officialFileBuffer: Buffer;
  let officialFileHash: string;
  let officialTemplateId: string;
  let officialFileDocumentId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Official Form Test", termsAccepted: true }),
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

  function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId, "Content-Type": "application/json" };
  }
  function authHeadersNoContentType(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": orgId };
  }

  async function assertRealDocx(documentId: string, expectations: { mustContain: readonly string[]; mustNotContain?: readonly string[] }): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/documents/${documentId}/download`, { headers: authHeaders(tokenOwner) });
    expect(res.status).toBe(200);
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file("word/document.xml")?.async("string");
    expect(documentXml).toBeDefined();
    for (const fragment of expectations.mustContain) {
      expect(documentXml).toContain(fragment);
    }
    for (const fragment of expectations.mustNotContain ?? []) {
      expect(documentXml).not.toContain(fragment);
    }
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

    await prisma.organization.create({ data: { id: orgId, name: "Official Form Org", slug: `official-form-org-${orgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" } });

    const owner = await registerAndLogin(`official-form-owner-${randomUUID()}@smoke.test`);
    userIds.push(owner.userId);
    tokenOwner = owner.token;

    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: orgId, userId: owner.userId, role: OrganizationRole.Owner, occurredAt: new Date() }),
    );

    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgId, name: "Client Formulaires Officiels", nameNormalized: "client formulaires officiels", status: "ACTIVE", createdBy: owner.userId } });
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgId, clientAccountId, title: "Marché formulaires officiels", status: "DRAFT", tags: [], createdBy: owner.userId } });

    const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(ensureDossierRes.status).toBe(200);

    // Gabarit "officiel" de test — DOCX structurellement valide, stocké tel quel via le module
    // Documents, jamais recréé/modifié par le pipeline Prepare/Preview/Generate.
    officialFileBuffer = await buildMinimalDocx({ heading: "DC4 — Déclaration de sous-traitance", paragraph: "Gabarit officiel de test (DAJ)." });
    officialFileHash = createHash("sha256").update(officialFileBuffer).digest("hex");

    const form = new FormData();
    form.append("title", "DC4 — gabarit officiel (test intégration)");
    form.append("origin", "IMPORTED");
    form.append("domain", "TEMPLATE");
    form.append("category", "DC4");
    form.append("file", new Blob([officialFileBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "DC4.docx");
    const uploadRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwner), body: form });
    expect(uploadRes.status).toBe(201);
    const uploaded = (await uploadRes.json()) as { id: string; currentVersion: { id: string } };
    officialFileDocumentId = uploaded.id;

    officialTemplateId = randomUUID();
    await prisma.officialAdministrativeTemplate.create({
      data: {
        id: officialTemplateId,
        organizationId: orgId,
        documentType: "DC4",
        officialName: "DC4 — Déclaration de sous-traitance",
        version: 1,
        sourceAuthority: "DAJ",
        sourceReference: "https://www.economie.gouv.fr/files/files/directions_services/daj/marches_publics/formulaires/DC/imprimes_dc/DC4_2023_Duree_contrat_sous_traitance.docx",
        fileDocumentId: uploaded.id,
        fileDocumentVersionId: uploaded.currentVersion.id,
        hash: officialFileHash,
        active: true,
        createdBy: owner.userId,
      },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.administrativeFormDraft.deleteMany({ where: { organizationId: orgId } });
    await prisma.officialAdministrativeTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.subcontractorDeclaration.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocumentRevision.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDocument.deleteMany({ where: { organizationId: orgId } });
    await prisma.administrativeDossier.deleteMany({ where: { organizationId: orgId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgId } });
    await prisma.document.deleteMany({ where: { organizationId: orgId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgId } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: orgId } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    // Checkpoint 2.1-A4 (correctif hygiène de test) — voir le commentaire identique dans
    // administrative-dossier-generation-http.integration.spec.ts.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await app.close();
  });

  it("mission — prepare/draft/preview/generate/validate, never touching the official reference file", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-traitant Officiel", servicesDescription: "Électricité", amountValue: 8000, amountCurrency: "EUR" }),
    });
    expect(createRes.status).toBe(201);
    const declaration = (await createRes.json()) as { id: string };

    // 1) Prepare — reads structured data, resolves the official reference template.
    const prepareRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form`, { headers: authHeaders(tokenOwner) });
    expect(prepareRes.status).toBe(200);
    const prepared = (await prepareRes.json()) as { canGenerate: boolean; values: Record<string, string>; referenceTemplate?: { kind: string; officialTemplateId?: string } };
    expect(prepared.canGenerate).toBe(true);
    expect(prepared.values.subcontractorName).toBe("Sous-traitant Officiel");
    expect(prepared.referenceTemplate).toEqual(expect.objectContaining({ kind: "OFFICIAL", officialTemplateId }));

    // 2) Save a local draft override — never touches SubcontractorDeclaration itself.
    const draftRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form/draft`, {
      method: "PUT",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ paymentTerms: "Paiement à 45 jours fin de mois" }),
    });
    expect(draftRes.status).toBe(200);
    const drafted = (await draftRes.json()) as { values: Record<string, string>; fieldSources: Record<string, string> };
    expect(drafted.values.paymentTerms).toBe("Paiement à 45 jours fin de mois");
    expect(drafted.fieldSources.paymentTerms).toBe("USER_INPUT");

    const declarationAfterDraft = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, { headers: authHeaders(tokenOwner) });
    const declarationsAfterDraft = (await declarationAfterDraft.json()) as { paymentTerms?: string }[];
    expect(declarationsAfterDraft.find((d: { paymentTerms?: string }) => d.paymentTerms !== undefined)).toBeUndefined();

    // 3) Preview — always watermarked, never persisted.
    const previewRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form/preview`, { headers: authHeaders(tokenOwner) });
    expect(previewRes.status).toBe(200);
    expect(previewRes.headers.get("content-disposition")).toContain("apercu");
    const previewBuffer = Buffer.from(await previewRes.arrayBuffer());
    expect(previewBuffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const previewZip = await JSZip.loadAsync(previewBuffer);
    const previewXml = await previewZip.file("word/document.xml")?.async("string");
    expect(previewXml).toContain("APER");
    expect(previewXml).toContain("45 jours");

    // 4) Generate — attaches a real Annexe TenderOS DOCX revision, never watermarked, snapshot-linked
    //    to the official template.
    const generateRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form/generate`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(generateRes.status).toBe(200);
    const generated = (await generateRes.json()) as { id: string; revisions: { id: string; revisionNumber: number; documentId: string; officialTemplateId?: string }[] };
    expect(generated.revisions).toHaveLength(1);
    expect(generated.revisions[0]!.officialTemplateId).toBe(officialTemplateId);
    await assertRealDocx(generated.revisions[0]!.documentId, { mustContain: ["Annexe TenderOS", "45 jours"], mustNotContain: ["APERÇU"] });

    // Regenerating creates revision #2 — the first is never overwritten (mission §9).
    const secondGenerateRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form/generate`, { method: "POST", headers: authHeaders(tokenOwner) });
    expect(secondGenerateRes.status).toBe(200);
    const secondGenerated = (await secondGenerateRes.json()) as { id: string; revisions: { revisionNumber: number }[] };
    expect(secondGenerated.id).toBe(generated.id);
    expect(secondGenerated.revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);

    // 5) Validate the latest revision.
    const latestRevision = secondGenerated.revisions[secondGenerated.revisions.length - 1] as unknown as { id: string };
    const validateRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${generated.id}/validate`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ revisionId: latestRevision.id }),
    });
    expect(validateRes.status).toBe(200);
    const validated = (await validateRes.json()) as { validatedRevisionId?: string };
    expect(validated.validatedRevisionId).toBe(latestRevision.id);

    // 6) The official reference file (DAJ, downloaded, stored as-is) is STILL byte-for-byte identical
    //    — never patched, never regenerated, across prepare/draft/preview/generate/validate.
    const officialDownloadRes = await fetch(`${baseUrl}/api/v1/documents/${officialFileDocumentId}/download`, { headers: authHeaders(tokenOwner) });
    expect(officialDownloadRes.status).toBe(200);
    const officialBufferAfter = Buffer.from(await officialDownloadRes.arrayBuffer());
    const hashAfter = createHash("sha256").update(officialBufferAfter).digest("hex");
    expect(hashAfter).toBe(officialFileHash);
    expect(officialBufferAfter.equals(officialFileBuffer)).toBe(true);
  }, 20000); // Checkpoint 2.1-A4 — 6 étapes HTTP réelles (prepare/draft/preview/generate x2/validate)
  // dans un seul test, déjà proche du timeout par défaut avant A4 ; voir le commentaire identique
  // dans administrative-dossier-official-form-fill-http.integration.spec.ts.

  it("isolates the prepared values/draft between two independent DC4 declarations on the same tender", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-subcontractors`, {
      method: "POST",
      headers: authHeaders(tokenOwner),
      body: JSON.stringify({ subcontractorName: "Sous-traitant B", servicesDescription: "Plomberie", amountValue: 1000, amountCurrency: "EUR" }),
    });
    const declaration = (await createRes.json()) as { id: string };

    const prepareRes = await fetch(`${baseUrl}/api/v1/administrative-subcontractors/${declaration.id}/official-form`, { headers: authHeaders(tokenOwner) });
    expect(prepareRes.status).toBe(200);
    const prepared = (await prepareRes.json()) as { values: Record<string, string> };
    expect(prepared.values.subcontractorName).toBe("Sous-traitant B");
    // No override was ever saved for THIS declaration — the "45 jours" draft from the other test
    // must never bleed across `scopeId` (mission §6, per-subcontractor draft scoping).
    expect(prepared.values.paymentTerms).toBeUndefined();
  });
});
