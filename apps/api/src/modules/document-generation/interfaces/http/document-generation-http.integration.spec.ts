import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const FIXTURE_PATH = join(__dirname, "..", "..", "test-support", "fixtures", "demo-template.docx");
const OOXML_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * V2 Sprint 10 (Moteur documentaire — Templates DOCX) — preuve réelle contre HTTP + PostgreSQL :
 * cycle de vie complet d'un template (upload réel, détection de placeholders, activation), lancement
 * d'une génération avec un VRAI moteur `docxtemplater`, téléchargement de l'artefact réel, régénération
 * en append-only, ClientAccess same-org cross-client, anti-IDOR cross-org, immutabilité de version,
 * et concurrence (verrou consultatif sur une lignée).
 */
describe("Moteur documentaire — Templates DOCX (real HTTP + PostgreSQL)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let tokenContributorA: string;
  let ownerAUserId: string;
  let contributorAUserId: string;

  const templateFileBuffer = readFileSync(FIXTURE_PATH);

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Document Generation HTTP Test" }),
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

  async function addMembership(input: { organizationId: string; userId: string; role: (typeof OrganizationRole)[keyof typeof OrganizationRole] }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({ id: MembershipId.from(randomUUID()), organizationId: input.organizationId, userId: input.userId, role: input.role, occurredAt: new Date() }),
    );
  }

  async function assignClient(input: { organizationId: string; clientAccountId: string; userId: string; role: "CLIENT_MANAGER" | "CONTRIBUTOR" | "VIEWER"; createdBy: string }): Promise<void> {
    await prisma.clientAssignment.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: input.clientAccountId, userId: input.userId, role: input.role, createdBy: input.createdBy },
    });
  }

  function jsonHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId, "Content-Type": "application/json" };
  }

  function multipartHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  async function createClientAndTender(input: { organizationId: string; userId: string }): Promise<{ clientAccountId: string; tenderId: string }> {
    const suffix = randomUUID();
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, name: `Client DocGen ${suffix}`, nameNormalized: `client docgen ${suffix}`, status: "ACTIVE", createdBy: input.userId },
    });
    const tender = await prisma.tender.create({
      data: { id: randomUUID(), organizationId: input.organizationId, clientAccountId: clientAccount.id, title: "Marché Moteur documentaire HTTP", status: "IN_ANALYSIS", tags: [], createdBy: input.userId },
    });
    return { clientAccountId: clientAccount.id, tenderId: tender.id };
  }

  /** Crée un template ACTIVE en une séquence complète (create -> upload multipart -> activate) —
   *  réutilisé par tous les tests de génération, jamais dupliqué. */
  async function createActiveTemplate(input: {
    token: string;
    organizationId: string;
    allowPartialGeneration: boolean;
  }): Promise<{ templateId: string; versionId: string }> {
    const createRes = await fetch(`${baseUrl}/api/v1/document-templates`, {
      method: "POST",
      headers: jsonHeaders(input.token, input.organizationId),
      body: JSON.stringify({ scope: "ORGANIZATION", name: `Modèle démonstration ${randomUUID()}` }),
    });
    expect(createRes.status).toBe(201);
    const template = (await createRes.json()) as { id: string };

    const fieldMappings = [
      { fieldKey: "tender.reference", label: "Référence", fieldType: "STRING", required: true },
      { fieldKey: "tender.title", label: "Titre", fieldType: "STRING", required: true },
      { fieldKey: "tender.deadline", label: "Date limite", fieldType: "DATE", required: false },
      { fieldKey: "pricing.totalAmount", label: "Montant total", fieldType: "CURRENCY", required: false },
      { fieldKey: "compliance.subcontracting", label: "Sous-traitance", fieldType: "CHECKBOX", required: false },
      { fieldKey: "tender.description", label: "Description", fieldType: "MULTILINE", required: false },
      { fieldKey: "candidate.name", label: "Candidat", fieldType: "STRING", required: true },
      { fieldKey: "items", label: "Prestations", fieldType: "TABLE", required: false },
    ];

    const form = new FormData();
    form.append("file", new Blob([templateFileBuffer], { type: OOXML_MIME }), "demo-template.docx");
    form.append("fieldMappings", JSON.stringify(fieldMappings));
    form.append("allowPartialGeneration", input.allowPartialGeneration ? "true" : "false");

    const versionRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions`, {
      method: "POST",
      headers: multipartHeaders(input.token, input.organizationId),
      body: form,
    });
    expect(versionRes.status).toBe(201);
    const version = (await versionRes.json()) as { id: string; discoveredPlaceholders: readonly { fieldKey: string }[] };
    expect(version.discoveredPlaceholders.map((p) => p.fieldKey)).toContain("tender.title");

    const activateRes = await fetch(`${baseUrl}/api/v1/document-templates/${template.id}/versions/${version.id}/activate`, {
      method: "POST",
      headers: jsonHeaders(input.token, input.organizationId),
    });
    expect(activateRes.status).toBe(200);

    return { templateId: template.id, versionId: version.id };
  }

  const FULL_DATA = {
    "tender.reference": "AO-2026-0421",
    "tender.title": "Marché de fourniture de mobilier de bureau",
    "tender.deadline": "2026-09-15",
    "pricing.totalAmount": 128500,
    "compliance.subcontracting": true,
    "tender.description": "Ligne 1\nLigne 2",
    "candidate.name": "Établissements Béranger & Cie",
    items: [{ name: "Bureaux", amount: 45000 }],
  };

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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "DocGen Org A HTTP", slug: `docgen-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "DocGen Org B HTTP", slug: `docgen-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`docgen-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`docgen-owner-b-${randomUUID()}@smoke.test`);
    const contributorA = await registerAndLogin(`docgen-contributor-a-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId, contributorA.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    tokenContributorA = contributorA.token;
    ownerAUserId = ownerA.userId;
    contributorAUserId = contributorA.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgAId, userId: contributorA.userId, role: OrganizationRole.Contributor });
  }, 60000);

  afterAll(async () => {
    await prisma.generatedDocumentRevision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.generatedDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplateFieldMapping.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplateVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentTenderAssociation.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAssignment.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
    await prisma.$disconnect();
  }, 60000);

  it("template lifecycle: create -> upload a real DOCX (multipart) -> placeholders detected -> activate -> only one ACTIVE version at a time", async () => {
    const { templateId, versionId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });

    const getRes = await fetch(`${baseUrl}/api/v1/document-templates/${templateId}`, { headers: jsonHeaders(tokenOwnerA, orgAId) });
    expect(getRes.status).toBe(200);
    const detail = (await getRes.json()) as { activeVersion: { id: string; status: string }; versions: readonly { id: string; status: string }[] };
    expect(detail.activeVersion.id).toBe(versionId);
    expect(detail.activeVersion.status).toBe("ACTIVE");
    expect(detail.versions.filter((v) => v.status === "ACTIVE")).toHaveLength(1);
  });

  it("BLOCKING — a non-admin org role (CONTRIBUTOR) is forbidden from creating a template, even though it can generate documents", async () => {
    const res = await fetch(`${baseUrl}/api/v1/document-templates`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ scope: "ORGANIZATION", name: `Interdit ${randomUUID()}` }),
    });
    expect(res.status).toBe(403);
  });

  it("generates a real DOCX end-to-end and the downloaded artifact is a genuine, non-empty ZIP/DOCX", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, title: "Mémoire technique — démonstration", data: FULL_DATA }),
    });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as { id: string; revisions: readonly { id: string; status: string; missingFields: readonly string[] }[] };
    expect(generated.revisions).toHaveLength(1);
    expect(generated.revisions[0]!.status).toBe("COMPLETED");
    expect(generated.revisions[0]!.missingFields).toEqual([]);

    const downloadRes = await fetch(`${baseUrl}/api/v1/document-revisions/${generated.revisions[0]!.id}/download`, { headers: jsonHeaders(tokenContributorA, orgAId) });
    expect(downloadRes.status).toBe(200);
    const bytes = Buffer.from(await downloadRes.arrayBuffer());
    // Signature ZIP "PK" — preuve qu'il ne s'agit jamais d'un texte brut ou d'un fichier vide.
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("BLOQUANT (correctif audit Codex P1-01) — an injected provenanceOverrides field in the HTTP body is silently stripped, never persisted as provenance", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const forgedProvenanceOverrides = {
      "tender.reference": { sourceEntityType: "Tender", sourceEntityId: "forged-tender-id", sourceEntityVersion: "v999", valuePath: "forged.path" },
    };

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      // Un client HTTP malveillant/négligent tente d'injecter une provenance fabriquée — le champ
      // n'existe même pas dans `GenerateDocumentBodySchema` : il doit être ignoré, jamais refusé
      // explicitement (le schéma le retire silencieusement, comportement Zod par défaut), et
      // surtout jamais persisté.
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA, provenanceOverrides: forgedProvenanceOverrides }),
    });
    expect(generateRes.status).toBe(201);
    const generated = (await generateRes.json()) as {
      revisions: readonly { id: string; provenance: readonly { fieldKey: string; provided: boolean; sourceEntityType?: string; sourceEntityId?: string }[] }[];
    };

    const referenceProvenance = generated.revisions[0]!.provenance.find((p) => p.fieldKey === "tender.reference");
    expect(referenceProvenance).toBeDefined();
    expect(referenceProvenance!.provided).toBe(true);
    expect(referenceProvenance!.sourceEntityType).toBeUndefined();
    expect(referenceProvenance!.sourceEntityId).toBeUndefined();

    // Re-vérifié directement en base — jamais seulement au niveau de la réponse HTTP.
    const persisted = await prisma.generatedDocumentRevision.findFirst({ where: { organizationId: orgAId, id: generated.revisions[0]!.id } });
    const persistedProvenance = (persisted?.provenance as unknown as { fieldKey: string; sourceEntityType?: string }[]) ?? [];
    expect(persistedProvenance.some((p) => p.sourceEntityType === "Tender")).toBe(false);
  });

  it("BLOQUANT (mission — jamais inventer une valeur manquante) — a required field missing WITHOUT allowPartialGeneration is refused with 422, never silently generated", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const { "candidate.name": _omitted, ...incompleteData } = FULL_DATA;
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: incompleteData }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("REQUIRED_FIELDS_MISSING");
  });

  it("allowPartialGeneration=true completes DESPITE a missing required field, and reports it in missingFields — never invents a value", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: true });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const { "candidate.name": _omitted, ...incompleteData } = FULL_DATA;
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: incompleteData }),
    });
    expect(res.status).toBe(201);
    const generated = (await res.json()) as { revisions: readonly { status: string; missingFields: readonly string[] }[] };
    expect(generated.revisions[0]!.status).toBe("COMPLETED");
    expect(generated.revisions[0]!.missingFields).toContain("candidate.name");
  });

  it("BLOQUANT (append-only + data-snapshot-freeze) — regenerate adds a NEW revision, never overwrites the previous one, and the old revision's snapshot never changes", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA }),
    });
    const generated = (await generateRes.json()) as { id: string; revisions: readonly { id: string; dataSnapshot: Record<string, unknown> }[] };
    const firstRevisionId = generated.revisions[0]!.id;

    const regenerateRes = await fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}/regenerate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ data: { ...FULL_DATA, "tender.reference": "AO-2026-9999-REGEN" } }),
    });
    expect(regenerateRes.status).toBe(201);
    const afterRegen = (await regenerateRes.json()) as { revisions: readonly { id: string; revisionNumber: number; previousRevisionId: string | null; dataSnapshot: Record<string, unknown> }[] };
    expect(afterRegen.revisions).toHaveLength(2);

    const sorted = [...afterRegen.revisions].sort((a, b) => a.revisionNumber - b.revisionNumber);
    expect(sorted[0]!.id).toBe(firstRevisionId);
    expect(sorted[0]!.dataSnapshot["tender.reference"]).toBe("AO-2026-0421");
    expect(sorted[1]!.revisionNumber).toBe(2);
    expect(sorted[1]!.previousRevisionId).toBe(firstRevisionId);
    expect(sorted[1]!.dataSnapshot["tender.reference"]).toBe("AO-2026-9999-REGEN");
  });

  it("BLOCKING — a VIEWER-tier client role can read generated documents but is forbidden from generating one", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const viewer = await registerAndLogin(`docgen-viewer-${randomUUID()}@smoke.test`);
    userIds.push(viewer.userId);
    await addMembership({ organizationId: orgAId, userId: viewer.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: viewer.userId, role: "VIEWER", createdBy: ownerAUserId });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generated`, { headers: jsonHeaders(viewer.token, orgAId) });
    expect(listRes.status).toBe(200);

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(viewer.token, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA }),
    });
    expect(generateRes.status).toBe(403);
  });

  it("BLOCKING — never leaks a generated document of a DIFFERENT client of the SAME organization (same-org cross-client)", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const clientA = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    const clientB = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });

    const jean = await registerAndLogin(`docgen-jean-${randomUUID()}@smoke.test`);
    userIds.push(jean.userId);
    await addMembership({ organizationId: orgAId, userId: jean.userId, role: OrganizationRole.Contributor });
    await assignClient({ organizationId: orgAId, clientAccountId: clientB.clientAccountId, userId: jean.userId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA }),
    });
    const generated = (await generateRes.json()) as { id: string; revisions: readonly { id: string }[] };

    const getRes = await fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}`, { headers: jsonHeaders(jean.token, orgAId) });
    expect(getRes.status).toBe(404);

    const downloadRes = await fetch(`${baseUrl}/api/v1/document-revisions/${generated.revisions[0]!.id}/download`, { headers: jsonHeaders(jean.token, orgAId) });
    expect(downloadRes.status).toBe(404);

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${clientA.tenderId}/documents/generated`, { headers: jsonHeaders(jean.token, orgAId) });
    expect(listRes.status).toBe(404);
  });

  it("BLOCKING — a DIFFERENT organization never sees a generated document or its revision download, even by guessing the exact UUID (cross-org anti-IDOR)", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA }),
    });
    const generated = (await generateRes.json()) as { id: string; revisions: readonly { id: string }[] };

    const crossOrgGetRes = await fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}`, { headers: jsonHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgGetRes.status).toBe(404);

    const crossOrgDownloadRes = await fetch(`${baseUrl}/api/v1/document-revisions/${generated.revisions[0]!.id}/download`, { headers: jsonHeaders(tokenOwnerB, orgBId) });
    expect(crossOrgDownloadRes.status).toBe(404);

    const crossOrgRegenerateRes = await fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}/regenerate`, {
      method: "POST",
      headers: jsonHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ data: FULL_DATA }),
    });
    expect(crossOrgRegenerateRes.status).toBe(404);
  });

  it("BLOQUANT (concurrence) — two simultaneous regenerate calls on the SAME lineage never collide on revisionNumber (advisory lock)", async () => {
    const { templateId } = await createActiveTemplate({ token: tokenOwnerA, organizationId: orgAId, allowPartialGeneration: false });
    const { clientAccountId, tenderId } = await createClientAndTender({ organizationId: orgAId, userId: ownerAUserId });
    await assignClient({ organizationId: orgAId, clientAccountId, userId: contributorAUserId, role: "CONTRIBUTOR", createdBy: ownerAUserId });

    const generateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      headers: jsonHeaders(tokenContributorA, orgAId),
      body: JSON.stringify({ documentTemplateId: templateId, data: FULL_DATA }),
    });
    const generated = (await generateRes.json()) as { id: string };

    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}/regenerate`, { method: "POST", headers: jsonHeaders(tokenContributorA, orgAId), body: JSON.stringify({ data: FULL_DATA }) }),
      fetch(`${baseUrl}/api/v1/generated-documents/${generated.id}/regenerate`, { method: "POST", headers: jsonHeaders(tokenContributorA, orgAId), body: JSON.stringify({ data: FULL_DATA }) }),
    ]);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    const revisions = await prisma.generatedDocumentRevision.findMany({ where: { organizationId: orgAId, generatedDocumentId: generated.id }, orderBy: { revisionNumber: "asc" } });
    expect(revisions).toHaveLength(3); // 1 (génération initiale) + 2 (régénérations concurrentes)
    expect(revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);
  });
});
