import { createHash, randomUUID } from "node:crypto";
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

/**
 * Preuve réelle HTTP + PostgreSQL du module Deliverables (Sprint 8A.1) — instancie l'`AppModule`
 * COMPLET (`Test.createTestingModule({ imports: [AppModule] })`), ce qui prouve simultanément que
 * le câblage NestJS de `DeliverablesModule` (tous les providers/repositories/contrôleurs) résout
 * sans erreur de dépendance manquante ou circulaire (mission §16 "vérification de démarrage") — un
 * échec de `compile()` ferait échouer ce test avant même le premier `it`.
 *
 * Flux couvert : initialisation des 9 livrables, template de mémoire (création + activation),
 * matérialisation des sections depuis le template actif, révision manuelle, édition (verrou
 * optimiste), soumission à revue, validation, sélection pour l'export, aperçu (réutilise le
 * pipeline Export existant), isolation inter-tenant.
 */
describe("Deliverables — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const tenderAId = randomUUID();
  const userIds: string[] = [];

  let tokenOwnerA: string;
  let tokenOwnerB: string;
  let ownerAUserId: string;
  let ownerBUserId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Deliverables HTTP Test" }),
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

  function authHeaders(token: string, organizationId: string): Record<string, string> {
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Deliverables Org A HTTP", slug: `deliverables-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Deliverables Org B HTTP", slug: `deliverables-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`deliverables-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`deliverables-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;
    ownerAUserId = ownerA.userId;
    ownerBUserId = ownerB.userId;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId } });
    await prisma.tender.create({ data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP", status: "DRAFT", tags: [], createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.deliverable.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.deliverableTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.exportJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // `documentVersion`/`documentTenderAssociation` cascadent depuis `document` (onDelete: Cascade).
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("GET /tenders/:tenderId/deliverables initializes and returns all 9 deliverable types", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; status: string }[];
    expect(body).toHaveLength(9);
    expect(body.every((d) => d.status === "NOT_STARTED")).toBe(true);
    expect(new Set(body.map((d) => d.type)).size).toBe(9);
  });

  it("full technical memo flow: template activation → sections materialize → manual revision → edit → review → validate → select-for-export → preview", async () => {
    // 1. Template ORGANIZATION-scope pour TECHNICAL_MEMO, créé DRAFT puis activé.
    const createTemplateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        scopeLevel: "ORGANIZATION",
        documentType: "TECHNICAL_MEMO",
        name: `Modèle HTTP ${randomUUID()}`,
        sections: [{ code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" }],
      }),
    });
    expect(createTemplateRes.status).toBe(201);
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };

    const activateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates/${template.id}/versions/${template.versions[0]!.id}/activate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(activateRes.status).toBe(200);

    // 2. Un NOUVEAU Tender (pour forcer une résolution de template fraîche) matérialise ses sections.
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP 2", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string; templateVersionId?: string }[];
    const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;
    expect(memo.templateVersionId).toBe(template.versions[0]!.id);

    const detailRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const detail = (await detailRes.json()) as { sections: { id: string; code: string }[] };
    expect(detail.sections).toHaveLength(1);
    const sectionId = detail.sections[0]!.id;

    // 3. Révision manuelle.
    const createRevisionRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Première rédaction." }] }),
    });
    expect(createRevisionRes.status).toBe(201);
    const revision = (await createRevisionRes.json()) as { id: string; editVersion: number };
    expect(revision.editVersion).toBe(0);

    // 4. Édition avec verrou optimiste — un editVersion obsolète est refusé (409).
    const staleEditRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Version concurrente obsolète." }], expectedEditVersion: 99 }),
    });
    expect(staleEditRes.status).toBe(409);

    const editRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Rédaction finalisée." }], expectedEditVersion: 0 }),
    });
    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as { editVersion: number; contentText: string };
    expect(edited.editVersion).toBe(1);
    expect(edited.contentText).toBe("Rédaction finalisée.");

    // 5. Revue et validation.
    const submitRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/submit-review`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(submitRes.status).toBe(200);

    const reviewRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/review`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "APPROVED" }),
    });
    expect(reviewRes.status).toBe(200);

    const sectionAfterReviewRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const revisions = (await sectionAfterReviewRes.json()) as { status: string }[];
    expect(revisions[0]?.status).toBe("VALIDATED");

    // 6. Sélection pour l'export — refuse un brouillon non validé (409/422), accepte le validé.
    const selectRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/select-for-export`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({}),
    });
    expect(selectRes.status).toBe(200);

    // 7. Aperçu — réutilise le pipeline Export existant (nécessite un ExportTemplate actif pour TECHNICAL_MEMO).
    const exportTemplateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: exportTemplateId, organizationId: orgAId, documentType: "TECHNICAL_MEMO", name: `ExportTpl-${randomUUID()}`, createdBy: ownerAUserId } });
    const exportTemplateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: {
        id: exportTemplateVersionId,
        organizationId: orgAId,
        exportTemplateId,
        version: 1,
        status: "ACTIVE",
        format: "DOCX",
        config: { sections: [{ id: "INTRO", label: "Introduction", mandatory: true, order: 0 }] },
        createdBy: ownerAUserId,
        activatedAt: new Date(),
      },
    });

    const previewRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}/preview`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(previewRes.status).toBe(201);
    const previewJob = (await previewRes.json()) as { status: string; mode: string };
    expect(previewJob.mode).toBe("PREVIEW");
  }, 30000);

  it("PATCH /deliverable-sections/:id locks then unlocks a section, and hiding it excludes it from the deliverable's computed status (mission §4/§15)", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;

    const sectionId = randomUUID();
    await prisma.deliverableSection.create({
      data: { id: sectionId, organizationId: orgAId, deliverableId: memo.id, code: "LOCK_TEST", title: "Section verrou", order: 0, headingLevel: 1, mandatory: false },
    });

    const lockRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ locked: true }) });
    expect(lockRes.status).toBe(200);
    expect(((await lockRes.json()) as { locked: boolean }).locked).toBe(true);

    // Une section verrouillée refuse toute nouvelle révision (jamais un contournement possible via l'API).
    const revisionOnLockedRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Devrait être refusé." }] }),
    });
    expect(revisionOnLockedRes.status).toBe(409);

    const unlockRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ locked: false }) });
    expect(((await unlockRes.json()) as { locked: boolean }).locked).toBe(false);

    const hideRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}`, { method: "PATCH", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ hidden: true }) });
    expect(((await hideRes.json()) as { hidden: boolean }).hidden).toBe(true);
  });

  it("POST /deliverables/:id/approve refuses until every visible section is VALIDATED, then approves (mission §15)", async () => {
    // Template + tender dédiés pour ne pas interférer avec les sections d'un autre test.
    const createTemplateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        scopeLevel: "ORGANIZATION",
        documentType: "TECHNICAL_MEMO",
        name: `Modèle Approbation ${randomUUID()}`,
        sections: [{ code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" }],
      }),
    });
    expect(createTemplateRes.status).toBe(201);
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    await fetch(`${baseUrl}/api/v1/deliverable-templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché Approbation", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;

    const detailRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const detail = (await detailRes.json()) as { sections: { id: string }[] };
    const sectionId = detail.sections[0]!.id;

    // Refusé tant que la section n'est pas VALIDÉE.
    const tooEarlyRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}/approve`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(tooEarlyRes.status).toBe(422);
    const tooEarlyBody = (await tooEarlyRes.json()) as { error: { code: string } };
    expect(tooEarlyBody.error.code).toBe("DELIVERABLE_NOT_READY_FOR_APPROVAL");

    // Rédaction → revue → validation de l'unique section.
    const createRevisionRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: "Rédaction." }] }),
    });
    const revision = (await createRevisionRes.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/submit-review`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/review`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ decision: "APPROVED" }),
    });

    const approveRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}/approve`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(approveRes.status).toBe(200);
    const approved = (await approveRes.json()) as { status: string; approvedBy: string; approvedAt: string };
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toBe(ownerAUserId);
    expect(approved.approvedAt).toBeTruthy();

    const afterApprovalDetailRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const afterApproval = (await afterApprovalDetailRes.json()) as { status: string };
    expect(afterApproval.status).toBe("APPROVED");
  }, 30000);

  type ExportSectionManifestEntry = {
    sectionId: string;
    deliverableProvenance?: {
      deliverableId: string;
      deliverableSectionId: string;
      deliverableRevisionId: string;
      revisionNumber: number;
      validationStatus: string;
      selectedBy: string;
      selectedAt: string;
    };
  };
  type ExportJobWithArtifact = {
    id: string;
    artifact?: { fileHash: string; manifest: { fileHash: string; sections: ExportSectionManifestEntry[] } };
  };

  it("audit Codex P1-001 — le manifest DOCX référence exactement la révision VALIDÉE sélectionnée, jamais un brouillon plus récent (répété ×3, contenus distincts)", async () => {
    // Export template DOCX dédié — le plus récent créé pour TECHNICAL_MEMO dans orgA gagne la
    // résolution (`ExportTemplateRepository.list()` trie par createdAt desc), donc utilisé par
    // toute nouvelle matérialisation, sans dépendre de l'ordre d'exécution des autres tests.
    const exportTemplateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: exportTemplateId, organizationId: orgAId, documentType: "TECHNICAL_MEMO", name: `ExportTpl-Provenance-${randomUUID()}`, createdBy: ownerAUserId } });
    await prisma.exportTemplateVersion.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        exportTemplateId,
        version: 1,
        status: "ACTIVE",
        format: "DOCX",
        config: { sections: [{ id: "INTRO", label: "Introduction", mandatory: true, order: 0 }] },
        createdBy: ownerAUserId,
        activatedAt: new Date(),
      },
    });

    for (let i = 1; i <= 3; i += 1) {
      const createTemplateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({
          scopeLevel: "ORGANIZATION",
          documentType: "TECHNICAL_MEMO",
          name: `Modèle Provenance ${i} ${randomUUID()}`,
          sections: [{ code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" }],
        }),
      });
      const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
      await fetch(`${baseUrl}/api/v1/deliverable-templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

      const tenderId = randomUUID();
      await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: `Marché Provenance ${i}`, status: "DRAFT", tags: [], createdBy: ownerAUserId } });

      const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const deliverables = (await listRes.json()) as { id: string; type: string }[];
      const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;
      const detailRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const detail = (await detailRes.json()) as { sections: { id: string }[] };
      const sectionId = detail.sections[0]!.id;

      // Révision 1 : rédigée, revue, VALIDÉE, puis explicitement sélectionnée pour l'export.
      const validatedText = `Contenu validé et sélectionné pour export — lot ${i}.`;
      const createRev1Res = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ content: [{ kind: "paragraph", text: validatedText }] }),
      });
      const revision1 = (await createRev1Res.json()) as { id: string };
      await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision1.id}/submit-review`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision1.id}/review`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ decision: "APPROVED" }),
      });
      const selectRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision1.id}/select-for-export`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({}),
      });
      expect(selectRes.status).toBe(200);

      // Révision 2 : brouillon PLUS RÉCENT que la sélection, jamais sélectionné — ne doit jamais
      // apparaître dans le manifest ni dans le fichier exporté.
      const draftText = `Brouillon plus récent, jamais sélectionné — lot ${i}.`;
      const createRev2Res = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ content: [{ kind: "paragraph", text: draftText }] }),
      });
      expect(createRev2Res.status).toBe(201);
      const revision2 = (await createRev2Res.json()) as { id: string };

      const previewRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}/preview`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(previewRes.status).toBe(201);
      const previewJob = (await previewRes.json()) as ExportJobWithArtifact;
      const manifestSection = previewJob.artifact!.manifest.sections.find((s) => s.sectionId === "INTRO")!;
      const provenance = manifestSection.deliverableProvenance!;

      expect(provenance).toBeDefined();
      expect(provenance.deliverableId).toBe(memo.id);
      expect(provenance.deliverableSectionId).toBe(sectionId);
      expect(provenance.deliverableRevisionId).toBe(revision1.id);
      expect(provenance.deliverableRevisionId).not.toBe(revision2.id);
      expect(provenance.revisionNumber).toBe(1);
      expect(provenance.validationStatus).toBe("VALIDATED");
      expect(provenance.selectedBy).toBe(ownerAUserId);
      expect(provenance.selectedAt).toBeTruthy();

      // Preuve par le fichier réel, jamais uniquement les métadonnées : le DOCX contient le texte
      // de la révision 1, jamais celui de la révision 2 (plus récente mais non sélectionnée).
      const downloadRes = await fetch(`${baseUrl}/api/v1/exports/${previewJob.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(downloadRes.status).toBe(200);
      const buffer = Buffer.from(await downloadRes.arrayBuffer());
      const zip = await JSZip.loadAsync(buffer);
      const documentXml = await zip.files["word/document.xml"]!.async("string");
      expect(documentXml).toContain(validatedText);
      expect(documentXml).not.toContain(draftText);

      // Hash cohérent : le hash figé dans le manifest correspond réellement au fichier téléchargé.
      const actualHash = createHash("sha256").update(buffer).digest("hex");
      expect(previewJob.artifact!.manifest.fileHash).toBe(actualHash);
      expect(previewJob.artifact!.fileHash).toBe(actualHash);
    }
  }, 90000);

  it("audit Codex P1-001 — le manifest PDF référence lui aussi la provenance Deliverables (même pipeline de rendu, jamais un second moteur)", async () => {
    // Organisation B, dédiée : évite toute ambiguïté avec les templates TECHNICAL_MEMO d'orgA déjà
    // créés par d'autres tests (résolution "le plus récent créé", mais ici on isole complètement).
    const clientBId = randomUUID();
    await prisma.clientAccount.create({ data: { id: clientBId, organizationId: orgBId, name: "Client B Provenance", nameNormalized: "client b provenance", status: "ACTIVE", createdBy: ownerBUserId } });

    const exportTemplateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: exportTemplateId, organizationId: orgBId, documentType: "TECHNICAL_MEMO", name: `ExportTpl-PDF-${randomUUID()}`, createdBy: ownerBUserId } });
    await prisma.exportTemplateVersion.create({
      data: {
        id: randomUUID(),
        organizationId: orgBId,
        exportTemplateId,
        version: 1,
        status: "ACTIVE",
        format: "PDF",
        config: { sections: [{ id: "INTRO", label: "Introduction", mandatory: true, order: 0 }] },
        createdBy: ownerBUserId,
        activatedAt: new Date(),
      },
    });

    const createTemplateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({
        scopeLevel: "ORGANIZATION",
        documentType: "TECHNICAL_MEMO",
        name: `Modèle PDF Provenance ${randomUUID()}`,
        sections: [{ code: "INTRO", title: "Introduction", order: 0, headingLevel: 1, requirement: "MANDATORY" }],
      }),
    });
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    await fetch(`${baseUrl}/api/v1/deliverable-templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });

    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgBId, clientAccountId: clientBId, title: "Marché PDF Provenance", status: "DRAFT", tags: [], createdBy: ownerBUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerB, orgBId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const memo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;
    const detailRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
    const detail = (await detailRes.json()) as { sections: { id: string }[] };
    const sectionId = detail.sections[0]!.id;

    const validatedText = "Contenu validé pour l'export PDF.";
    const createRevRes = await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ content: [{ kind: "paragraph", text: validatedText }] }),
    });
    const revision = (await createRevRes.json()) as { id: string };
    await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/submit-review`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/review`, {
      method: "POST",
      headers: authHeaders(tokenOwnerB, orgBId),
      body: JSON.stringify({ decision: "APPROVED" }),
    });
    await fetch(`${baseUrl}/api/v1/deliverable-sections/${sectionId}/revisions/${revision.id}/select-for-export`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId), body: JSON.stringify({}) });

    const previewRes = await fetch(`${baseUrl}/api/v1/deliverables/${memo.id}/preview`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId) });
    expect(previewRes.status).toBe(201);
    const previewJob = (await previewRes.json()) as ExportJobWithArtifact & { format: string };
    expect(previewJob.format).toBe("PDF");
    const manifestSection = previewJob.artifact!.manifest.sections.find((s) => s.sectionId === "INTRO")!;
    expect(manifestSection.deliverableProvenance?.deliverableRevisionId).toBe(revision.id);
    expect(manifestSection.deliverableProvenance?.validationStatus).toBe("VALIDATED");

    const downloadRes = await fetch(`${baseUrl}/api/v1/exports/${previewJob.id}/download`, { headers: authHeaders(tokenOwnerB, orgBId) });
    expect(downloadRes.status).toBe(200);
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    expect(previewJob.artifact!.manifest.fileHash).toBe(actualHash);
  }, 30000);

  it("audit Codex P1-002 — le rapport financier reste lié à la version Sprint 7 sélectionnée, jamais à un recalcul ultérieur", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché Pricing Figé", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const costReport = deliverables.find((d) => d.type === "COST_REPORT")!;

    // Version 1 — créée puis consultée AVANT toute sélection explicite : repli sur le comportement
    // historique ("la dernière estimation"), signalé explicitement `frozen: false`.
    const createEstimateRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/pricing/estimates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ assumptions: { workHours: 10, hourlyRate: "50.00" } }),
    });
    expect(createEstimateRes.status).toBe(201);
    const estimate = (await createEstimateRes.json()) as { id: string; currentVersion: { version: number; amount: string } };
    expect(estimate.currentVersion.version).toBe(1);
    const versionOneAmount = estimate.currentVersion.amount;

    const beforeSelectionRes = await fetch(`${baseUrl}/api/v1/deliverables/${costReport.id}/cost-report`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(beforeSelectionRes.status).toBe(200);
    const beforeSelection = (await beforeSelectionRes.json()) as { frozen: boolean; estimate: { currentVersion: { amount: string } } };
    expect(beforeSelection.frozen).toBe(false);
    expect(beforeSelection.estimate.currentVersion.amount).toBe(versionOneAmount);

    // Sélection EXPLICITE de la version 1 — fige la référence.
    const selectRes = await fetch(`${baseUrl}/api/v1/deliverables/${costReport.id}/cost-report/select-estimate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ pricingEstimateId: estimate.id, versionNumber: 1 }),
    });
    expect(selectRes.status).toBe(200);
    const selected = (await selectRes.json()) as { costReportPricingEstimateId: string; costReportPricingEstimateVersionNumber: number; costReportSelectedBy: string };
    expect(selected.costReportPricingEstimateId).toBe(estimate.id);
    expect(selected.costReportPricingEstimateVersionNumber).toBe(1);
    expect(selected.costReportSelectedBy).toBe(ownerAUserId);

    // Version 2 — recalcul créant une NOUVELLE estimation courante, plus tard.
    const recalcRes = await fetch(`${baseUrl}/api/v1/pricing/estimates/${estimate.id}/recalculate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ assumptions: { workHours: 40, hourlyRate: "80.00" }, reason: "Périmètre revu à la hausse." }),
    });
    expect(recalcRes.status).toBe(200);
    const recalculated = (await recalcRes.json()) as { currentVersion: { version: number; amount: string } };
    expect(recalculated.currentVersion.version).toBe(2);
    expect(recalculated.currentVersion.amount).not.toBe(versionOneAmount);

    // Le rapport financier relit TOUJOURS la version 1 — jamais la version 2 plus récente.
    const afterRecalcRes = await fetch(`${baseUrl}/api/v1/deliverables/${costReport.id}/cost-report`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(afterRecalcRes.status).toBe(200);
    const afterRecalc = (await afterRecalcRes.json()) as {
      frozen: boolean;
      estimate: { currentVersion: { version: number; amount: string; disclaimerText: string } };
      selection?: { pricingEstimateId: string; pricingEstimateVersionNumber: number };
    };
    expect(afterRecalc.frozen).toBe(true);
    expect(afterRecalc.estimate.currentVersion.version).toBe(1);
    expect(afterRecalc.estimate.currentVersion.amount).toBe(versionOneAmount);
    expect(afterRecalc.estimate.currentVersion.disclaimerText).toContain("non contractuelle");
    expect(afterRecalc.selection?.pricingEstimateVersionNumber).toBe(1);

    // Une seconde sélection portant sur une AUTRE version est refusée (jamais un remplacement
    // silencieux d'un rapport déjà figé).
    const reselectRes = await fetch(`${baseUrl}/api/v1/deliverables/${costReport.id}/cost-report/select-estimate`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ pricingEstimateId: estimate.id, versionNumber: 2 }),
    });
    expect(reselectRes.status).toBe(409);
    const reselectBody = (await reselectRes.json()) as { error: { code: string } };
    expect(reselectBody.error.code).toBe("DELIVERABLE_COST_REPORT_ALREADY_FROZEN");
  }, 30000);

  it("audit Codex P1-003 — checklist/annexes refusent tout document inexistant, supprimé, ou d'une autre organisation, et acceptent un document valide", async () => {
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché Documents", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string }[];
    const checklist = deliverables.find((d) => d.type === "CHECKLIST")!;
    const annexes = deliverables.find((d) => d.type === "ANNEXES")!;

    async function seedDocument(input: { organizationId: string; deletedAt?: Date; associateWithTenderId?: string }): Promise<string> {
      const documentId = randomUUID();
      const versionId = randomUUID();
      await prisma.document.create({
        data: {
          id: documentId,
          organizationId: input.organizationId,
          title: "Attestation",
          origin: "USER_UPLOAD",
          domain: "TENDER",
          status: "ACTIVE",
          currentVersionNumber: 1,
          createdByUserId: ownerAUserId,
          deletedAt: input.deletedAt ?? null,
        },
      });
      await prisma.documentVersion.create({
        data: {
          id: versionId,
          organizationId: input.organizationId,
          documentId,
          versionNumber: 1,
          originalFilename: "attestation.pdf",
          sanitizedFilename: "attestation.pdf",
          mimeType: "application/pdf",
          extension: "pdf",
          sizeBytes: 1024,
          checksum: "a".repeat(64),
          storageKey: `documents/${input.organizationId}/${documentId}/1.pdf`,
          uploadedByUserId: ownerAUserId,
        },
      });
      await prisma.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } });
      if (input.associateWithTenderId) {
        await prisma.documentTenderAssociation.create({
          data: { documentId, tenderId: input.associateWithTenderId, organizationId: input.organizationId, createdByUserId: ownerAUserId },
        });
      }
      return documentId;
    }

    // Document valide, associé à CE Tender — accepté, la référence de version est dérivée du
    // document vérifié (jamais fournie par le client).
    const validDocumentId = await seedDocument({ organizationId: orgAId, associateWithTenderId: tenderId });
    const createEntryRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ name: "Attestation fiscale", mandatory: true }),
    });
    const entry = (await createEntryRes.json()) as { id: string };
    const attachValidRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist/${entry.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: validDocumentId }),
    });
    expect(attachValidRes.status).toBe(200);
    const attached = (await attachValidRes.json()) as { status: string; documentVersionId: string; documentChecksum: string; documentFileName: string; documentMimeType: string };
    expect(attached.status).toBe("PROVIDED");
    expect(attached.documentVersionId).toBeTruthy();
    expect(attached.documentChecksum).toBe("a".repeat(64));
    expect(attached.documentFileName).toBe("attestation.pdf");
    expect(attached.documentMimeType).toBe("application/pdf");

    // L'annexe accepte le même document, la même provenance vérifiée s'applique.
    const createAnnexRes = await fetch(`${baseUrl}/api/v1/deliverables/${annexes.id}/annexes`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ label: "Certificat qualité", documentId: validDocumentId }),
    });
    expect(createAnnexRes.status).toBe(201);
    const annex = (await createAnnexRes.json()) as { status: string; documentVersionId: string };
    expect(annex.status).toBe("PROVIDED");
    expect(annex.documentVersionId).toBeTruthy();

    // Document inexistant — refusé (404, jamais une fuite d'information distincte d'un document réel refusé).
    const missingRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist/${entry.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: randomUUID() }),
    });
    expect(missingRes.status).toBe(404);

    // Document d'une AUTRE organisation — refusé exactement de la même façon (404), jamais un 403
    // qui confirmerait son existence.
    const crossOrgDocumentId = await seedDocument({ organizationId: orgBId });
    const crossOrgRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist/${entry.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: crossOrgDocumentId }),
    });
    expect(crossOrgRes.status).toBe(404);
    expect(((await missingRes.json()) as { error: { code: string } }).error.code).toBe(((await crossOrgRes.clone().json()) as { error: { code: string } }).error.code);

    // Document supprimé (soft-delete) — refusé.
    const deletedDocumentId = await seedDocument({ organizationId: orgAId, deletedAt: new Date(), associateWithTenderId: tenderId });
    const deletedRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist/${entry.id}`, {
      method: "PATCH",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: deletedDocumentId }),
    });
    expect(deletedRes.status).toBe(404);

    // Après tous les refus, l'entrée reste sur son association valide d'origine (jamais un
    // remplacement partiel par une tentative refusée).
    const finalListRes = await fetch(`${baseUrl}/api/v1/deliverables/${checklist.id}/checklist`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const finalList = (await finalListRes.json()) as { id: string; documentId?: string }[];
    expect(finalList.find((e) => e.id === entry.id)?.documentId).toBe(validDocumentId);
  }, 30000);

  it("audit Codex P1-004 — le repli TENDEROS s'applique réellement quand aucun palier tenant n'a de version active, ORGANIZATION garde priorité sinon, et la création TENDEROS est refusée", async () => {
    // EXECUTIVE_SUMMARY et les thèmes n'ont jamais été touchés par un autre test de ce fichier —
    // aucun template/thème TENDER/CLIENT/ORGANIZATION n'existe pour eux dans orgA : le repli
    // TENDEROS (seedé par la migration 20260902140000) est donc réellement exercé, pas simulé.
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché TenderOS", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/deliverables`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const deliverables = (await listRes.json()) as { id: string; type: string; templateVersionId?: string; templateSourceLevel?: string; themeVersionId?: string; themeSourceLevel?: string }[];
    const execSummary = deliverables.find((d) => d.type === "EXECUTIVE_SUMMARY")!;

    expect(execSummary.templateSourceLevel).toBe("TENDEROS");
    expect(execSummary.templateVersionId).toBe("00000000-0000-0000-0000-000000070012");
    expect(execSummary.themeSourceLevel).toBe("TENDEROS");
    expect(execSummary.themeVersionId).toBe("00000000-0000-0000-0000-000000080002");

    // La matérialisation a réellement recopié la section placeholder du modèle système.
    const detailRes = await fetch(`${baseUrl}/api/v1/deliverables/${execSummary.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const detail = (await detailRes.json()) as { sections: { code: string; title: string }[] };
    expect(detail.sections.map((s) => s.code)).toEqual(["CONTENU"]);

    // Un template TECHNICAL_MEMO ORGANIZATION existe déjà dans orgA (tests précédents) — il garde
    // la priorité sur TENDEROS, jamais l'inverse.
    const technicalMemo = deliverables.find((d) => d.type === "TECHNICAL_MEMO")!;
    expect(technicalMemo.templateSourceLevel).not.toBe("TENDEROS");

    // Le palier TENDEROS n'est jamais créable via l'API tenant, même pour un OWNER — rejeté dès la
    // validation de forme (400), avant même d'atteindre la garde applicative.
    const createSystemTemplateRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({
        scopeLevel: "TENDEROS",
        documentType: "TECHNICAL_MEMO",
        name: "Tentative interdite",
        sections: [{ code: "X", title: "X", order: 0, headingLevel: 1 }],
      }),
    });
    expect(createSystemTemplateRes.status).toBe(400);

    // Le modèle/thème système ne sont jamais exposés dans la liste d'orgA (organisation distincte,
    // aucune fuite inter-organisation d'une ressource système).
    const listTemplatesRes = await fetch(`${baseUrl}/api/v1/deliverable-templates`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const templates = (await listTemplatesRes.json()) as { id: string }[];
    expect(templates.find((t) => t.id === "00000000-0000-0000-0000-000000070001")).toBeUndefined();
  }, 30000);

  it("tenant isolation — organization B cannot read organization A's deliverables", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/deliverables`, { headers: authHeaders(tokenOwnerB, orgBId) });
    // Le Tender A n'existe pas pour l'organisation B — la chaîne GetTenderUseCase le rejette.
    expect(res.status).toBe(404);
  });
});
