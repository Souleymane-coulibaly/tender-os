import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const EXPORT_ARTIFACT_CONTENT = Buffer.from("%PDF-1.4 mémoire technique approuvée (fixture Sprint 9)");
const FILE_HASH = computeSha256(EXPORT_ARTIFACT_CONTENT);

/**
 * Sprint 9 — dépôt manuel assisté et suivi de soumission, preuve réelle HTTP + PostgreSQL. Ce
 * module n'expose aucune route pour produire un package final (hors de son périmètre), donc
 * chaque Tender "packageable" est semé via la même recette que
 * `submission-package-http.integration.spec.ts` (ExportJob/ExportArtifact FINAL/COMPLETED ->
 * ValidationRun -> FinalApproval ACTIVE), puis le package réel est créé via le vrai endpoint HTTP
 * `POST /tenders/:tenderId/packages` — jamais un package fabriqué directement en base.
 */
describe("Submission — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const clientAId = randomUUID();
  const userIds: string[] = [];

  let ownerAUserId: string;
  let tokenOwnerA: string;
  let tokenOwnerB: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Submission HTTP Test", termsAccepted: true }),
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
  function authHeadersNoContentType(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  /** Sème un Tender avec la chaîne Export FINAL/COMPLETED jusqu'à une FinalApproval ACTIVE (même
   *  recette que `submission-package-http.integration.spec.ts`) — le seul chemin réel pour rendre
   *  un Tender packageable hors du périmètre HTTP de ce module. */
  async function seedApprovedTender(input: { title: string; submissionDeadline?: Date }): Promise<{ tenderId: string }> {
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: input.title, status: "DRAFT", tags: [], createdBy: ownerAUserId, submissionDeadline: input.submissionDeadline ?? null } });

    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgAId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: ownerAUserId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgAId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerAUserId },
    });
    const exportJobId = randomUUID();
    const storageKey = `exports/${orgAId}/${tenderId}/${exportJobId}.pdf`;
    await prisma.exportJob.create({
      data: { id: exportJobId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportTemplateId: templateId, exportTemplateVersionId: templateVersionId, documentType: "TECHNICAL_MEMO", mode: "FINAL", format: "PDF", status: "COMPLETED", version: 1, createdBy: ownerAUserId },
    });
    await prisma.exportArtifact.create({
      data: { id: randomUUID(), organizationId: orgAId, exportJobId, fileName: "memoire-technique.pdf", mimeType: "application/pdf", fileSize: EXPORT_ARTIFACT_CONTENT.length, fileHash: FILE_HASH, storageKey, manifestJson: {} },
    });
    const storageProvider = app.get<StorageProvider>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(EXPORT_ARTIFACT_CONTENT), contentType: "application/pdf", sizeBytes: EXPORT_ARTIFACT_CONTENT.length });

    const validationRunId = randomUUID();
    await prisma.validationRun.create({ data: { id: validationRunId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerAUserId } });

    const approvalId = randomUUID();
    await prisma.finalApproval.create({
      data: { id: approvalId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, validationRunId, manifestHash: FILE_HASH, approvedBy: ownerAUserId, approverRole: "OWNER" },
    });

    return { tenderId };
  }

  async function createPackage(tenderId: string): Promise<{ id: string; version: number }> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; version: number };
  }

  async function uploadProofDocument(): Promise<{ id: string }> {
    const form = new FormData();
    form.append("title", "Accusé de réception plateforme (test)");
    form.append("origin", "USER_UPLOAD");
    form.append("domain", "TENDER");
    form.append("category", "SUBMISSION_PROOF");
    form.append("file", new Blob([Buffer.from("Accusé de réception — fixture")], { type: "text/plain" }), "recu.txt");
    const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: form });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string };
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

    await prisma.organization.createMany({
      data: [
        { id: orgAId, name: "Submission Org A HTTP", slug: `submission-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Submission Org B HTTP", slug: `submission-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`submission-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`submission-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    ownerAUserId = ownerA.userId;
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client Submission A", nameNormalized: "client submission a", status: "ACTIVE", createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.submissionProof.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tenderSubmission.deleteMany({ where: { organizationId: orgAId } });
    await prisma.packageFile.deleteMany({ where: { organizationId: orgAId } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId: orgAId } });
    await prisma.finalApproval.deleteMany({ where: { organizationId: orgAId } });
    await prisma.validationRun.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgAId } });
    // Checkpoint 2.1-P2.1-FIX-F — `TenderChecklistItem.matchedDocumentId` est une vraie FK vers
    // `Document` (pas de `onDelete: Cascade` déclaré) : doit être nettoyée AVANT `document`/
    // `documentVersion` ci-dessous, sinon la suppression du Document échoue tant qu'un item de
    // checklist le référence encore.
    await prisma.tenderChecklistItem.deleteMany({ where: { organizationId: orgAId } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgAId } });
    await prisma.document.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    // Checkpoint 2.1-P2.1-FIX-F — le Tender référençant `candidateCompanyId` est déjà supprimé
    // ci-dessus ; Dce/AnalysisJob/TenderAnalysisSummary/TenderChecklistItem/
    // TenderChecklistReconciliation/TenderLot/ResponsePackage* cascadent tous sur la suppression du
    // Tender (`onDelete: Cascade`, même motif AUDIT-007 partout dans le schéma) — jamais besoin
    // d'un nettoyage explicite supplémentaire pour ces tables.
    await prisma.candidateCompany.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
    // TENDEROS-2.1-P2.1-FINAL-HYGIENE — `outbox_events_organization_id_fkey` est une vraie FK SQL
    // (ON DELETE RESTRICT, migration 20260907090000) jamais déclarée côté Prisma (`OutboxEvent` n'a
    // aucune relation `organization` dans le schéma), donc invisible à un simple audit du schéma —
    // confirmée en lisant directement la migration. Les lignes `OutboxEvent` ne sont JAMAIS
    // supprimées par le système en production (`markPublished`/`markFailedAndReschedule` ne font que
    // changer `status`, voir `PrismaOutboxEventRepository`) : elles s'accumulent tant qu'un flux réel
    // publie un événement de domaine (analyse, checklist, validation, package, etc. — cette suite en
    // déclenche plusieurs via de vraies routes HTTP). Doit donc être nettoyée explicitement ici, AVANT
    // `organization.deleteMany` ci-dessous — jamais un `deleteMany({})` global (mission §23, scope
    // strictement les deux organisations de cette suite). `processed_events` cascade depuis
    // `outbox_events` (`ON DELETE CASCADE`, même migration) : aucun nettoyage séparé nécessaire.
    await prisma.outboxEvent.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  });

  it("refuses an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${randomUUID()}/submission-readiness`);
    expect(res.status).toBe(401);
  });

  /** Checkpoint 2.1-P2.1-FIX-F — recette mission §174 : Dce réel + `TenderAnalysisSummary` SUCCEEDED
   *  (même motif que `validation-http.integration.spec.ts`/`technical-memo-http.integration.spec.ts`)
   *  pour rendre l'analyse CURRENT sans dépendre d'un vrai appel IA (non disponible dans cet
   *  environnement de test — `AI_PROVIDER_NOT_CONFIGURED`, voir `analysis-http.integration.spec.ts`).
   *  `analysisVersion`/`dceRevision` paramétrables pour piloter une réanalyse (FIX-F.1 TEST Validation race). */
  async function seedSucceededAnalysis(input: { tenderId: string; analysisVersion?: number; dceRevision?: number }): Promise<void> {
    const analysisVersion = input.analysisVersion ?? 1;
    const dceRevision = input.dceRevision ?? 1;
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: { id: jobId, organizationId: orgAId, tenderId: input.tenderId, targetId: input.tenderId, scope: "TENDER", status: "SUCCEEDED", analysisVersion, promptVersion: 1, triggeredByRole: "OWNER", updatedAt: new Date() },
    });
    await prisma.tenderAnalysisSummary.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId: input.tenderId,
        analysisJobId: jobId,
        analysisVersion,
        dceRevision,
        opportunitySummary: "Marché HTTP dossier complet (FIX-F).",
        complexityLevel: "MEDIUM",
        goNoGoRecommendation: "GO",
        goNoGoRationale: "Dossier complet.",
      },
    });
  }

  /** Checkpoint 2.1-P2.1-FIX-F.1 — sème un dossier RÉELLEMENT complet (recette mission §174,
   *  extraite pour être réutilisée par les tests TOCTOU FIX-F.1 §16-22) : Candidate + Analyse
   *  CURRENT + Checklist réconciliée + Validation CURRENT (flux réel export/run/approve, capture la
   *  vraie provenance analysisVersion/dceRevision/candidateCompanyId) + package legacy
   *  `submission-package` + Dossier de réponse VALIDATED/CURRENT (Lot + item MANDATORY satisfait +
   *  build + validate). Retourne tout ce dont les tests de mutation ont besoin pour casser UNE
   *  dimension à la fois sans re-semer tout le dossier. */
  async function seedReadyDossier(input: { title: string; submissionDeadline?: Date; skipResponsePackageArtifactGeneration?: boolean }): Promise<{
    tenderId: string;
    dceId: string;
    candidateCompanyId: string;
    lotId: string;
    legacyPackage: { id: string; version: number };
    responsePackageId: string;
    responsePackageVersionId: string;
    responsePackageArtifactId: string | undefined;
    responsePackageArtifactChecksum: string | undefined;
  }> {
    const localClientId = randomUUID();
    const tenderId = randomUUID();
    const candidateCompanyId = randomUUID();

    await prisma.candidateCompany.create({
      data: { id: candidateCompanyId, organizationId: orgAId, name: `Entreprise Candidate ${tenderId}`, nameNormalized: `entreprise candidate ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId },
    });
    await prisma.clientAccount.create({ data: { id: localClientId, organizationId: orgAId, name: `Client ${tenderId}`, nameNormalized: `client ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: localClientId, candidateCompanyId, title: input.title, status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId, submissionDeadline: input.submissionDeadline ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    const dceId = randomUUID();
    await prisma.dce.create({ data: { id: dceId, organizationId: orgAId, tenderId, status: "IMPORTED", revision: 1, createdByUserId: ownerAUserId } });

    // Candidate + Analyse CURRENT.
    await seedSucceededAnalysis({ tenderId });

    // Checklist réconciliée contre CETTE analyse (analysisVersion=1) — CURRENT.
    const reconcileRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(reconcileRes.status).toBe(200);

    // GO/NO-GO et Mémoire technique volontairement absents : jamais requis quand ils n'existent pas
    // pour ce Tender (mission §34/§39, voir `evaluate-file-readiness.ts`).

    // Validation : flux réel export/run/approve (même recette que `validation-http.integration.spec.ts`)
    // — capture la vraie provenance (analysisVersion=1/dceRevision=1/candidateCompanyId) -> CURRENT.
    const createTemplateRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentType: "TECHNICAL_MEMO", name: `FIX-F.1 tpl ${randomUUID()}`, format: "DOCX", config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] } }),
    });
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });

    const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ exportTemplateId: template.id, sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique, largement suffisant pour éviter tout avertissement de longueur." }] }),
    });
    const previewJob = (await previewRes.json()) as { id: string };

    const runRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/run`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ exportJobId: previewJob.id }) });
    const run = (await runRes.json()) as { id: string };
    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/final-approval`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ validationRunId: run.id }) });
    expect(approveRes.status).toBe(201);

    // Package de dépôt (legacy `submission-package`) — guard legacy conservé (mission §13/§30).
    const legacyPackage = await createPackage(tenderId);

    // Dossier de réponse (response-package) — TOUJOURS requis (mission §63) : un Lot, un item
    // MANDATORY déjà satisfait (document réel matché), build -> validate -> VALIDATED/CURRENT.
    const lot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "1", title: "Lot unique", displayOrder: 0 } });

    const docForm = new FormData();
    docForm.append("title", "DC1.pdf");
    docForm.append("origin", "USER_UPLOAD");
    docForm.append("domain", "TENDER");
    docForm.append("file", new Blob([Buffer.from("contenu réel DC1 (fixture FIX-F.1)")], { type: "application/pdf" }), "DC1.pdf");
    const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: docForm });
    expect(docRes.status).toBe(201);
    const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };

    await prisma.tenderChecklistItem.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId,
        lotId: lot.id,
        title: "DC1",
        status: "TODO",
        type: "ADMINISTRATIVE_DOCUMENT",
        requirementLevel: "MANDATORY",
        subjectType: "CANDIDATE",
        complianceStatus: "TO_REVIEW",
        documentStatus: "AVAILABLE",
        matchedDocumentId: doc.id,
        matchedDocumentVersionId: doc.currentVersion.id,
        documentMatchStatus: "MANUALLY_ATTACHED",
      },
    });

    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot.id }) });
    expect(createRpRes.status).toBe(201);
    const rp = (await createRpRes.json()) as { id: string };

    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string }; items: { id: string; status: string }[] };
    expect(built.items.every((item) => item.status === "READY")).toBe(true);

    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);

    // Checkpoint TENDEROS-2.1-P2.2-F2 — génère RÉELLEMENT l'artefact ZIP (mission §57 "CURRENT +
    // validated + artifact") : sans cet appel, `GetSubmittableResponsePackageVersionUseCase`
    // résoudrait `ARTIFACT_MISSING` (aucun `PackageArtifact` en base) — un dossier "READY" au sens
    // F2 doit avoir un artefact réellement généré, jamais seulement validé. `skipResponsePackageArtifactGeneration`
    // (mission §67 TEST MISSING ARTIFACT) laisse volontairement ce cas non résolu pour un test dédié.
    if (input.skipResponsePackageArtifactGeneration) {
      return { tenderId, dceId, candidateCompanyId, lotId: lot.id, legacyPackage, responsePackageId: rp.id, responsePackageVersionId: built.version.id, responsePackageArtifactId: undefined, responsePackageArtifactChecksum: undefined };
    }
    const generateRpRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRpRes.status).toBe(201);
    const rpArtifact = (await generateRpRes.json()) as { id: string; checksum: string };

    return { tenderId, dceId, candidateCompanyId, lotId: lot.id, legacyPackage, responsePackageId: rp.id, responsePackageVersionId: built.version.id, responsePackageArtifactId: rpArtifact.id, responsePackageArtifactChecksum: rpArtifact.checksum };
  }

  it("Checkpoint 2.1-P2.1-FIX-F — E2E (mission §174) : un dossier RÉELLEMENT complet (Candidate + Analyse CURRENT + Checklist réconciliée + Validation CURRENT + Dossier de réponse VALIDATED/CURRENT) est READY_FOR_SUBMISSION, sans AUCUNE raison bloquante", async () => {
    const { tenderId } = await seedReadyDossier({ title: "Marché dossier complet FIX-F" });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { canSubmit: boolean; readinessStatus: string; blockers: string[]; fileReadinessReasons: { code: string; severity: string }[] };
    expect(readiness.fileReadinessReasons.filter((r) => r.severity === "BLOCKING")).toEqual([]);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.readinessStatus).toBe("READY_FOR_SUBMISSION");
    expect(readiness.canSubmit).toBe(true);
  });

  describe("Checkpoint 2.1-P2.1-FIX-F.1 — le guard backend final impose la Submission Readiness V2", () => {
    it("TEST 1/TEST 25 (preuve P1) — readiness BLOCKED (dossier legacy minimal, sans Candidate/Analyse/Response Package) refuses POST /submissions with 422 TENDER_NOT_READY_FOR_SUBMISSION, carrying the blocking reason codes", async () => {
      const { tenderId } = await seedApprovedTender({ title: "Marché P1 avant/après" });
      const pkg = await createPackage(tenderId);

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readinessRes.json() as { readinessStatus: string }).readinessStatus).toBe("BLOCKED");

      // AVANT FIX-F.1 : ce même appel retournait 201 (le P1 fermé par ce checkpoint). APRÈS : 422.
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: pkg.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.code).toBe("TENDER_NOT_READY_FOR_SUBMISSION");
      expect(body.error.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["CANDIDATE_MISSING", "ANALYSIS_MISSING", "RESPONSE_PACKAGE_MISSING"]));
    });

    it("TEST 2 — a genuinely READY dossier (legacy package valid + deadline valid) succeeds", async () => {
      const { tenderId, legacyPackage } = await seedReadyDossier({ title: "Marché READY succès" });
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      expect((await res.json() as { status: string }).status).toBe("SUBMITTED");
    });

    it("TEST 3/TEST 16 (DCE race) — READY, then a DCE revision bump makes Analysis stale, then POST /submissions is refused", async () => {
      const { tenderId, dceId, legacyPackage } = await seedReadyDossier({ title: "Marché DCE race" });
      await prisma.dce.update({ where: { id: dceId }, data: { revision: 2 } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("ANALYSIS_STALE");
    });

    it("TEST 4/TEST 17 (Candidate race) — READY, then the Candidate is unassigned from the Tender, then POST /submissions is refused", async () => {
      const { tenderId, legacyPackage } = await seedReadyDossier({ title: "Marché Candidate race" });
      await prisma.tender.update({ where: { id: tenderId }, data: { candidateCompanyId: null } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("CANDIDATE_MISSING");
    });

    it("TEST 5/TEST 21 (Validation race) — READY, then a reanalysis (v2) leaves the active FinalApproval's captured provenance (v1) behind, making Validation stale, then POST /submissions is refused", async () => {
      const { tenderId, dceId, legacyPackage } = await seedReadyDossier({ title: "Marché Validation race" });
      // Réanalyse v2 contre un DCE rev2 : l'analyse elle-même redevient CURRENT, mais la
      // FinalApproval ACTIVE reste capturée contre v1/rev1 — c'est ELLE qui devient STALE.
      await prisma.dce.update({ where: { id: dceId }, data: { revision: 2 } });
      await seedSucceededAnalysis({ tenderId, analysisVersion: 2, dceRevision: 2 });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("VALIDATION_STALE");
    });

    it("TEST 6/TEST 22 (Response Package race) — READY, then a new mandatory checklist item appears after the package was built/validated, making it stale, then POST /submissions is refused", async () => {
      const { tenderId, lotId, legacyPackage } = await seedReadyDossier({ title: "Marché Response Package race" });
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId,
          lotId,
          title: "Attestation ajoutée après coup",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "MISSING",
          documentMatchStatus: "NOT_SEARCHED",
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });

    it("TEST 7 — a WARNING-only reason (GO/NO-GO = NO_GO) never blocks an otherwise READY dossier", async () => {
      const { tenderId, candidateCompanyId, legacyPackage } = await seedReadyDossier({ title: "Marché GO-NO-GO warning" });
      await prisma.goNoGoReport.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId,
          reportVersion: 1,
          analysisVersion: 1,
          dceRevision: 1,
          candidateCompanyId,
          globalScore: 10,
          confidence: 0.5,
          complexity: 3,
          documentaryLoad: "HIGH",
          estimatedPrepTime: {},
          categoryScores: {},
          recommendation: "NO_GO",
          recommendationRationale: "Score trop faible (fixture FIX-F.1 TEST 7).",
          calculationVersion: "v1",
        },
      });

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const readiness = (await readinessRes.json()) as { fileReadinessReasons: { code: string; severity: string }[] };
      expect(readiness.fileReadinessReasons).toContainEqual(expect.objectContaining({ code: "GONOGO_NO_GO", severity: "WARNING" }));

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
    });

    it("TEST 8/§29 — a genuinely READY dossier with an EXPIRED deadline is still refused (deadline stays independently authoritative)", async () => {
      const { tenderId, legacyPackage } = await seedReadyDossier({ title: "Marché READY mais échéance dépassée", submissionDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SUBMISSION_DEADLINE_PASSED");
    });

    it("TEST 9/mission §29 — a genuinely READY dossier with an OUTDATED legacy package is still refused (legacy package guard stays independently authoritative)", async () => {
      const { tenderId, legacyPackage: outdated } = await seedReadyDossier({ title: "Marché READY mais package obsolète" });
      await createPackage(tenderId); // nouvelle version, rend `outdated` obsolète

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: outdated.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SUBMISSION_PACKAGE_OUTDATED");
    });

    it("mission §29 (correctif audit Codex P1) — refuses to complete a SUBMISSION_IN_PROGRESS deposit if the pinned package became obsolete since start, even on an otherwise READY dossier", async () => {
      const { tenderId, legacyPackage: startedPackage } = await seedReadyDossier({ title: "Marché dépôt en cours devenu obsolète" });

      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: startedPackage.id, platform: "PLACE" }),
      });
      expect(startRes.status).toBe(201);
      const started = (await startRes.json()) as { id: string; status: string };
      expect(started.status).toBe("SUBMISSION_IN_PROGRESS");

      // Une nouvelle version COMPLETED est générée pendant que le dépôt reste "en cours" — le
      // package initialement pinné devient obsolète.
      await createPackage(tenderId);

      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: startedPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(422);
      const recordBody = (await recordRes.json()) as { error: { code: string } };
      expect(recordBody.error.code).toBe("SUBMISSION_PACKAGE_OUTDATED");

      await fetch(`${baseUrl}/api/v1/submissions/${started.id}/cancel`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    });

    it("TEST 10 — cross-tenant: org B never sees org A's readiness, submissions, or a cross-org submission id (404, never revealing existence)", async () => {
      const { tenderId, legacyPackage } = await seedReadyDossier({ title: "Marché isolation FIX-F.1" });
      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      const submission = (await recordRes.json()) as { id: string };

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(readinessRes.status).toBe(404);

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(getRes.status).toBe(404);

      const withdrawRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}/withdraw`, { method: "POST", headers: authHeaders(tokenOwnerB, orgBId), body: JSON.stringify({}) });
      expect(withdrawRes.status).toBe(404);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2 — Response Package V2 connectée à la Submission finale", () => {
    it("TEST HAPPY PATH V2 (mission §57) — a genuinely READY dossier records provenance pointing exactly at the validated CURRENT ResponsePackageVersion/artifact/checksum", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 happy path V2" });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { id: string; status: string; responsePackageVersionId?: string; responsePackageArtifactId?: string; responsePackageArtifactChecksum?: string };
      expect(submission.status).toBe("SUBMITTED");
      expect(submission.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(submission.responsePackageArtifactId).toBe(seed.responsePackageArtifactId);
      expect(submission.responsePackageArtifactChecksum).toBe(seed.responsePackageArtifactChecksum);

      // Persisté, pas seulement retourné à l'instant T — une relecture réelle le confirme.
      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackageVersionId?: string };
      expect(persisted.responsePackageVersionId).toBe(seed.responsePackageVersionId);
    });

    it("TEST HISTORICAL PROVENANCE (mission §58) — a later rebuild that moves the ResponsePackage's current version forward leaves the already-recorded Submission's provenance untouched", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 provenance historique" });

      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);
      const submission = (await recordRes.json()) as { id: string; responsePackageVersionId?: string };
      expect(submission.responsePackageVersionId).toBe(seed.responsePackageVersionId);

      // Rebuild réel : une nouvelle version COURANTE (V2) est produite pour le MÊME ResponsePackage
      // (mission §7 "réutiliser le SOT existant, jamais un nouveau moteur") — le pointeur `currentVersionId`
      // avance, mais la Submission déjà enregistrée reste figée sur la version qui existait au dépôt.
      const rebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(rebuildRes.status).toBe(201);
      const rebuilt = (await rebuildRes.json()) as { version: { id: string; versionNumber: number } };
      expect(rebuilt.version.id).not.toBe(seed.responsePackageVersionId);
      expect(rebuilt.version.versionNumber).toBeGreaterThan(1);

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackageVersionId?: string; responsePackageArtifactId?: string; responsePackageArtifactChecksum?: string };
      expect(persisted.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(persisted.responsePackageArtifactId).toBe(seed.responsePackageArtifactId);
      expect(persisted.responsePackageArtifactChecksum).toBe(seed.responsePackageArtifactChecksum);
    });

    it("TEST MISSING ARTIFACT (mission §67) — a validated CURRENT ResponsePackageVersion with no generated artifact refuses the deposit cleanly, no Submission persisted", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 artefact manquant", skipResponsePackageArtifactGeneration: true });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("RESPONSE_PACKAGE_ARTIFACT_MISSING");

      const activeRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const active = (await activeRes.json()) as { canSubmit: boolean };
      // La readiness V2 (FIX-A..E) n'exige que "validated + CURRENT", jamais l'existence d'un
      // artefact ZIP réellement généré (mission §67 : c'est une dimension DISTINCTE, propre à F2) —
      // elle reste donc `true` alors même que le dépôt vient d'être refusé pour cette raison précise.
      expect(active.canSubmit).toBe(true);
    });

    it("TEST MULTI-LOT AMBIGUITY (mission §6/§29) — a Tender with two ResponsePackages (one per lot) never guesses: the legacy deposit still succeeds, but with empty V2 provenance", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 multi-lot ambiguïté" });

      // Second lot, son propre dossier de réponse V2 complet (build -> validate -> generate) — le
      // Tender porte alors DEUX ResponsePackage distincts (un par lot), jamais fusionnés (mission §29).
      const secondLot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: seed.tenderId, lotNumber: "2", title: "Lot secondaire", displayOrder: 1 } });
      const docForm = new FormData();
      docForm.append("title", "DC1-lot2.pdf");
      docForm.append("origin", "USER_UPLOAD");
      docForm.append("domain", "TENDER");
      docForm.append("file", new Blob([Buffer.from("contenu réel DC1 lot 2 (fixture F2)")], { type: "application/pdf" }), "DC1-lot2.pdf");
      const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: docForm });
      expect(docRes.status).toBe(201);
      const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: secondLot.id,
          title: "DC1 lot 2",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "AVAILABLE",
          matchedDocumentId: doc.id,
          matchedDocumentVersionId: doc.currentVersion.id,
          documentMatchStatus: "MANUALLY_ATTACHED",
        },
      });
      const createRp2Res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: secondLot.id }) });
      expect(createRp2Res.status).toBe(201);
      const rp2 = (await createRp2Res.json()) as { id: string };
      const build2Res = await fetch(`${baseUrl}/api/v1/response-packages/${rp2.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(build2Res.status).toBe(201);
      const built2 = (await build2Res.json()) as { version: { id: string } };
      const validate2Res = await fetch(`${baseUrl}/api/v1/response-packages/${rp2.id}/versions/${built2.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(validate2Res.status).toBe(200);
      const generate2Res = await fetch(`${baseUrl}/api/v1/response-packages/${rp2.id}/versions/${built2.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(generate2Res.status).toBe(201);

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { status: string; responsePackageVersionId?: string; responsePackageArtifactId?: string; responsePackageArtifactChecksum?: string };
      expect(submission.status).toBe("SUBMITTED");
      expect(submission.responsePackageVersionId).toBeUndefined();
      expect(submission.responsePackageArtifactId).toBeUndefined();
      expect(submission.responsePackageArtifactChecksum).toBeUndefined();
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2.1 — parité V2 sur le flux start() -> recordFromInProgress()", () => {
    async function startInProgress(input: { tenderId: string; packageId: string }): Promise<{ id: string; status: string }> {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: input.packageId, platform: "PLACE" }),
      });
      expect(res.status).toBe(201);
      const started = (await res.json()) as { id: string; status: string };
      expect(started.status).toBe("SUBMISSION_IN_PROGRESS");
      return started;
    }

    it("TEST IN-PROGRESS HAPPY PATH (mission §32) — READY -> start() -> recordFromInProgress() captures the same V2 provenance as a direct record", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress happy path" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { status: string; responsePackageVersionId?: string; responsePackageArtifactId?: string; responsePackageArtifactChecksum?: string };
      expect(submission.status).toBe("SUBMITTED");
      expect(submission.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(submission.responsePackageArtifactId).toBe(seed.responsePackageArtifactId);
      expect(submission.responsePackageArtifactChecksum).toBe(seed.responsePackageArtifactChecksum);
    });

    it("TEST IN-PROGRESS HISTORY (mission §33) — a rebuild after recordFromInProgress() leaves the finalized Submission's V1 provenance untouched", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress historique" });
      const started = await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });

      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);

      const rebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(rebuildRes.status).toBe(201);

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${started.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackageVersionId?: string; responsePackageArtifactId?: string };
      expect(persisted.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(persisted.responsePackageArtifactId).toBe(seed.responsePackageArtifactId);
    });

    it("TEST IN-PROGRESS ARTIFACT MISSING (mission §34) — a univoque CURRENT/validated dossier with no generated artifact refuses recordFromInProgress() cleanly, submission stays IN_PROGRESS", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress artefact manquant", skipResponsePackageArtifactGeneration: true });
      const started = await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("RESPONSE_PACKAGE_ARTIFACT_MISSING");

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${started.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { status: string };
      expect(persisted.status).toBe("SUBMISSION_IN_PROGRESS");
    });

    it("TEST IN-PROGRESS DCE RACE (mission §35) — READY -> start() -> DCE revision bump -> recordFromInProgress() is refused, exactly like the direct-record race", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress DCE race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("ANALYSIS_STALE");
    });

    it("TEST IN-PROGRESS CANDIDATE RACE (mission §36) — READY -> start() -> Candidate unassigned -> recordFromInProgress() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Candidate race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });
      await prisma.tender.update({ where: { id: seed.tenderId }, data: { candidateCompanyId: null } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("CANDIDATE_MISSING");
    });

    it("TEST IN-PROGRESS VALIDATION RACE (mission §37) — READY -> start() -> reanalysis leaves the active FinalApproval's captured provenance behind -> recordFromInProgress() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Validation race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });
      await seedSucceededAnalysis({ tenderId: seed.tenderId, analysisVersion: 2, dceRevision: 2 });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("VALIDATION_STALE");
    });

    it("TEST IN-PROGRESS PACKAGE RACE (mission §38) — READY -> start() -> a new mandatory checklist item makes Response Package stale -> recordFromInProgress() is refused, never silently submitting the stale V1", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Response Package race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage.id });
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: seed.lotId,
          title: "Attestation ajoutée après start()",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "MISSING",
          documentMatchStatus: "NOT_SEARCHED",
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });
  });

  it("mission — full lifecycle: readiness -> record -> proof -> confirm receipt -> replace -> reject, with history conserved and the old package reference untouched", async () => {
    const { tenderId, legacyPackage: firstPackage, responsePackageVersionId, responsePackageArtifactId, responsePackageArtifactChecksum } = await seedReadyDossier({ title: "Marché dépôt complet" });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { canSubmit: boolean; packageId: string; readinessStatus: string; fileReadinessReasons: { code: string }[] };
    expect(readiness.canSubmit).toBe(true);
    expect(readiness.packageId).toBe(firstPackage.id);
    expect(readiness.readinessStatus).toBe("READY_FOR_SUBMISSION");
    expect(readiness.fileReadinessReasons).toEqual([]);

    const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: firstPackage.id, platform: "PLACE", submittedAt: new Date().toISOString(), platformReference: "REF-PLACE-1" }),
    });
    expect(recordRes.status).toBe(201);
    const firstSubmission = (await recordRes.json()) as { id: string; status: string; packageId: string; packageVersion: number };
    expect(firstSubmission.status).toBe("SUBMITTED");
    expect(firstSubmission.packageId).toBe(firstPackage.id);
    expect(firstSubmission.packageVersion).toBe(firstPackage.version);

    // Un second enregistrement direct est refusé tant qu'une soumission est déjà en vol.
    const conflictRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: firstPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
    });
    expect(conflictRes.status).toBe(409);
    const conflictBody = (await conflictRes.json()) as { error: { code: string } };
    expect(conflictBody.error.code).toBe("ACTIVE_TENDER_SUBMISSION_ALREADY_EXISTS");

    const proofDocument = await uploadProofDocument();
    const proofRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}/proofs`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentId: proofDocument.id, proofType: "ACKNOWLEDGEMENT" }),
    });
    expect(proofRes.status).toBe(201);
    const afterProof = (await proofRes.json()) as { proofs: readonly { documentId: string; proofType: string }[] };
    expect(afterProof.proofs).toHaveLength(1);
    expect(afterProof.proofs[0]!.documentId).toBe(proofDocument.id);

    // Correctif audit Codex P1 — la preuve est réellement rattachée au Tender de la soumission
    // (jamais seulement "accessible" à l'acteur), preuve structurelle via l'association réelle du
    // module Documents.
    const proofAssociation = await prisma.documentTenderAssociation.findUnique({ where: { documentId_tenderId: { documentId: proofDocument.id, tenderId } } });
    expect(proofAssociation).not.toBeNull();

    const confirmRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}/confirm-receipt`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(confirmRes.status).toBe(200);
    const confirmed = (await confirmRes.json()) as { status: string };
    expect(confirmed.status).toBe("RECEIPT_CONFIRMED");

    // Un second package (nouvelle version) pour un remplacement avec un package RÉELLEMENT différent.
    const secondPackage = await createPackage(tenderId);
    expect(secondPackage.version).toBe(firstPackage.version + 1);

    const replaceRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}/replace`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: secondPackage.id, platform: "AWS_ACHAT", submittedAt: new Date().toISOString() }),
    });
    expect(replaceRes.status).toBe(201);
    const secondSubmission = (await replaceRes.json()) as { id: string; status: string; supersedesSubmissionId: string; packageId: string; responsePackageVersionId?: string; responsePackageArtifactId?: string; responsePackageArtifactChecksum?: string };
    expect(secondSubmission.status).toBe("SUBMITTED");
    expect(secondSubmission.supersedesSubmissionId).toBe(firstSubmission.id);
    expect(secondSubmission.packageId).toBe(secondPackage.id);
    // Checkpoint TENDEROS-2.1-P2.2-F2.1 (ferme le gap identifié par l'audit F2) — le remplacement
    // capture lui aussi la provenance V2, même dossier toujours CURRENT/validé depuis le seed.
    expect(secondSubmission.responsePackageVersionId).toBe(responsePackageVersionId);
    expect(secondSubmission.responsePackageArtifactId).toBe(responsePackageArtifactId);
    expect(secondSubmission.responsePackageArtifactChecksum).toBe(responsePackageArtifactChecksum);

    // L'ancienne soumission reste REPLACED, avec SA référence de package d'origine intacte —
    // jamais réécrite rétroactivement (mission §18) — y compris sa PROPRE provenance V2 (capturée
    // au moment du premier record(), jamais réécrite par le replace()).
    const oldRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(oldRes.status).toBe(200);
    const old = (await oldRes.json()) as { status: string; replacedBySubmissionId: string; packageId: string; responsePackageVersionId?: string };
    expect(old.status).toBe("REPLACED");
    expect(old.replacedBySubmissionId).toBe(secondSubmission.id);
    expect(old.packageId).toBe(firstPackage.id);
    expect(old.responsePackageVersionId).toBe(responsePackageVersionId);

    // Historique complet conservé — les deux soumissions apparaissent, jamais écrasées.
    const historyRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, { headers: authHeaders(tokenOwnerA, orgAId) });
    const history = (await historyRes.json()) as readonly { id: string }[];
    expect(history.map((s) => s.id).sort()).toEqual([firstSubmission.id, secondSubmission.id].sort());

    // Rejet technique de la nouvelle soumission active.
    const rejectRes = await fetch(`${baseUrl}/api/v1/submissions/${secondSubmission.id}/reject`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ rejectionCategory: "INVALID_FORMAT", rejectionDescription: "Format de fichier refusé par la plateforme." }),
    });
    expect(rejectRes.status).toBe(200);
    const rejected = (await rejectRes.json()) as { status: string; rejectionCategory: string };
    expect(rejected.status).toBe("SUBMISSION_REJECTED");
    expect(rejected.rejectionCategory).toBe("INVALID_FORMAT");
  });

  it("mission §10/§22 — refuses platform OTHER without a custom name (400), before any readiness/deadline check", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché plateforme libre" });
    const pkg = await createPackage(tenderId);

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: pkg.id, platform: "OTHER", submittedAt: new Date().toISOString() }),
    });
    expect(res.status).toBe(400);
  });

  it("mission §15 — records a withdrawal without deleting the submission, and warns it is not automatic on the buyer platform (frontend-side text)", async () => {
    const { tenderId, legacyPackage: pkg } = await seedReadyDossier({ title: "Marché retrait" });
    const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: pkg.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
    });
    const submission = (await recordRes.json()) as { id: string };

    const withdrawRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}/withdraw`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ withdrawalReason: "Erreur de saisie" }),
    });
    expect(withdrawRes.status).toBe(200);
    const withdrawn = (await withdrawRes.json()) as { status: string; withdrawalReason: string };
    expect(withdrawn.status).toBe("WITHDRAWN");
    expect(withdrawn.withdrawalReason).toBe("Erreur de saisie");

    const stillThereRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(stillThereRes.status).toBe(200);
  });
});
