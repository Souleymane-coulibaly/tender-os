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
    // Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 4 — RecordTenderSubmissionUseCase consomme
    // désormais un crédit AO au premier dépôt : ENTERPRISE (illimité, jamais de ledger numérique,
    // voir ConsumeAoCreditUseCase) évite tout effet de bord sur les nombreux dépôts de cette suite,
    // qui ne porte pas sur la facturation.
    await prisma.organizationSubscription.createMany({
      data: [
        { id: randomUUID(), organizationId: orgAId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
        { id: randomUUID(), organizationId: orgBId, planTier: "ENTERPRISE", billingInterval: "MONTHLY", status: "ACTIVE", source: "MANUAL" },
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
    // Checkpoint TENDEROS-2.1-P2.3-E12.4 FIX-1 (H6-01) — l'application est fermee AVANT la purge,
    // jamais apres. Preuve a l'origine de ce correctif : sur 246 organisations residuelles, les
    // tables qui bloquaient encore leur suppression etaient `outbox_events` (440 lignes) et
    // `audit_logs` (218) — ecrites par le travail de fond APRES que ce teardown les ait purgees.
    // La suppression finale de l'organisation violait alors la FK, `afterAll` avortait, et toute
    // la fixture racine (organisation, utilisateurs, sessions) fuyait d'un run a l'autre.
    // `app.close()` attend desormais le travail en vol (`BackgroundTaskRunner`, E12.3) : apres ce
    // point plus aucune ecriture n'est possible, la purge est donc deterministe. Prisma se
    // reconnecte paresseusement pour les suppressions ci-dessous.
    await app.close();
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
    await prisma.organizationSubscription.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    // Checkpoint CCV2-E.3 — le solde ET le ledger de crédits AO référencent l'organisation : sans
    // ce nettoyage, la suppression viole leurs clés étrangères respectives.
    await prisma.aoCreditLedgerEntry.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organizationAoCreditBalance.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
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
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — `undefined` quand
    // `skipResponsePackageArtifactGeneration` : SANS artefact V2, AUCUN package legacy ne peut plus
    // être créé du tout (`CreateSubmissionPackageUseCase` l'exige désormais AVANT toute autre chose,
    // mission §1) — ce n'est plus seulement `RecordTenderSubmissionUseCase` qui le refusait après
    // coup.
    legacyPackage: { id: string; version: number } | undefined;
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

    // Dossier de réponse (response-package) — TOUJOURS requis (mission §63) : un Lot, un item
    // MANDATORY déjà satisfait (document réel matché), build -> validate -> VALIDATED/CURRENT.
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — DOIT désormais être construit AVANT le package
    // legacy (`createPackage` ci-dessous) : `CreateSubmissionPackageUseCase` exige un dossier V2
    // RÉSOLU + CURRENT avant de créer quoi que ce soit (mission §1).
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
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — SANS artefact, `createPackage` échouerait
    // désormais lui-même (`PACKAGE_NOT_READY`, mission §1) : `legacyPackage` reste `undefined` pour
    // cette branche, jamais un package fabriqué qui ne pourrait plus exister en pratique.
    if (input.skipResponsePackageArtifactGeneration) {
      return { tenderId, dceId, candidateCompanyId, lotId: lot.id, legacyPackage: undefined, responsePackageId: rp.id, responsePackageVersionId: built.version.id, responsePackageArtifactId: undefined, responsePackageArtifactChecksum: undefined };
    }
    const generateRpRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRpRes.status).toBe(201);
    const rpArtifact = (await generateRpRes.json()) as { id: string; checksum: string };

    // Package de dépôt (legacy `submission-package`) — guard legacy conservé (mission §13/§30).
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 — DOIT venir APRÈS le dossier V2 (Lot/checklist/build/
    // validate/generate ci-dessus) : `CreateSubmissionPackageUseCase` exige désormais un dossier V2
    // RÉSOLU + CURRENT avant de créer quoi que ce soit (mission §1).
    const legacyPackage = await createPackage(tenderId);

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
      // Checkpoint TENDEROS-2.1-P2.2-F4.1 (OPTION C) — un package legacy ne peut même plus être
      // CRÉÉ sans dossier V2 résolu (`createPackage(tenderId)` échouerait désormais lui-même) : la
      // readiness (testée ici) est un gate PLUS PRÉCOCE que la résolution du package, réutilisé tel
      // quel — un `packageId` fictif suffit à prouver que ce gate refuse AVANT même de le résoudre.

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readinessRes.json() as { readinessStatus: string }).readinessStatus).toBe("BLOCKED");

      // AVANT FIX-F.1 : ce même appel retournait 201 (le P1 fermé par ce checkpoint). APRÈS : 422.
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: randomUUID(), platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
    });

    it("TEST 8/§29 — a genuinely READY dossier with an EXPIRED deadline is still refused (deadline stays independently authoritative)", async () => {
      const { tenderId, legacyPackage } = await seedReadyDossier({ title: "Marché READY mais échéance dépassée", submissionDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: outdated!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: startedPackage!.id, platform: "PLACE" }),
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
        body: JSON.stringify({ packageId: startedPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
        body: JSON.stringify({ packageId: legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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

  /** Checkpoint TENDEROS-2.1-P2.2-F2.3 — crée un second lot RÉELLEMENT sélectionné pour candidature
   *  (`selectedForResponse` par défaut `true`) avec son propre document/item MANDATORY matché
   *  (nécessaire pour que `build` produise un item READY), et son propre `ResponsePackage` scopé
   *  (jamais fusionné avec celui du seed). Ne construit PAS la version par défaut — chaque test
   *  avance lui-même jusqu'où il en a besoin (build seul / +validate / +generate), pour couvrir
   *  MISSING/UNVALIDATED/ARTIFACT_MISSING/READY sans dupliquer la recette.
   */
  async function seedSecondLot(input: { tenderId: string; selectedForResponse?: boolean }): Promise<{ lotId: string; responsePackageId: string }> {
    const lot = await prisma.tenderLot.create({
      data: { id: randomUUID(), organizationId: orgAId, tenderId: input.tenderId, lotNumber: "2", title: "Lot secondaire", displayOrder: 1, selectedForResponse: input.selectedForResponse ?? true },
    });
    const docForm = new FormData();
    docForm.append("title", "DC1-lot2.pdf");
    docForm.append("origin", "USER_UPLOAD");
    docForm.append("domain", "TENDER");
    docForm.append("file", new Blob([Buffer.from(`contenu réel DC1 lot 2 (fixture F2.3 ${lot.id})`)], { type: "application/pdf" }), "DC1-lot2.pdf");
    const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: docForm });
    expect(docRes.status).toBe(201);
    const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };
    await prisma.tenderChecklistItem.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId: input.tenderId,
        lotId: lot.id,
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
    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot.id }) });
    expect(createRpRes.status).toBe(201);
    const rp = (await createRpRes.json()) as { id: string };
    return { lotId: lot.id, responsePackageId: rp.id };
  }

  async function buildValidateGenerate(responsePackageId: string): Promise<{ versionId: string; artifactId: string; checksum: string }> {
    const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(buildRes.status).toBe(201);
    const built = (await buildRes.json()) as { version: { id: string } };
    const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${responsePackageId}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(validateRes.status).toBe(200);
    const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${responsePackageId}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(generateRes.status).toBe(201);
    const artifact = (await generateRes.json()) as { id: string; checksum: string };
    return { versionId: built.version.id, artifactId: artifact.id, checksum: artifact.checksum };
  }

  /** Checkpoint TENDEROS-2.1-P2.2-F2.3.1, mission §12/§17/§20 — seedReadyDossier crée TOUJOURS un
   *  Tender avec un lot unique et un dossier de réponse SCOPÉ à ce lot (mode LOT, N=1) — aucun test
   *  de cette suite n'exerçait jusqu'ici le mode GLOBAL réel (0 `TenderLot`, dossier `lotId: null`)
   *  via HTTP. Recette identique à `seedReadyDossier`, mais SANS aucun `TenderLot` et avec un item
   *  de checklist Tender-wide (`lotId: undefined`), pour que le dossier de réponse global (créé sans
   *  `lotId` dans le body) l'inclue (`isRelevantToLot(itemLotId, undefined) === (itemLotId === undefined)`).
   */
  async function seedGlobalReadyDossier(input: { title: string }): Promise<{
    tenderId: string;
    legacyPackage: { id: string; version: number };
    responsePackageId: string;
    responsePackageVersionId: string;
    responsePackageArtifactId: string;
    responsePackageArtifactChecksum: string;
  }> {
    const localClientId = randomUUID();
    const tenderId = randomUUID();
    const candidateCompanyId = randomUUID();

    await prisma.candidateCompany.create({ data: { id: candidateCompanyId, organizationId: orgAId, name: `Entreprise Candidate ${tenderId}`, nameNormalized: `entreprise candidate ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
    await prisma.clientAccount.create({ data: { id: localClientId, organizationId: orgAId, name: `Client ${tenderId}`, nameNormalized: `client ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
    await prisma.tender.create({
      data: { id: tenderId, organizationId: orgAId, clientAccountId: localClientId, candidateCompanyId, title: input.title, status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId, submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    });
    const dceId = randomUUID();
    await prisma.dce.create({ data: { id: dceId, organizationId: orgAId, tenderId, status: "IMPORTED", revision: 1, createdByUserId: ownerAUserId } });
    await seedSucceededAnalysis({ tenderId });
    const reconcileRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(reconcileRes.status).toBe(200);

    const createTemplateRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ documentType: "TECHNICAL_MEMO", name: `F2.3.1 tpl ${randomUUID()}`, format: "DOCX", config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] } }),
    });
    const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
    await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/exports/preview`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ exportTemplateId: template.id, sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique, largement suffisant." }] }),
    });
    const previewJob = (await previewRes.json()) as { id: string };
    const runRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/run`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ exportJobId: previewJob.id }) });
    const run = (await runRes.json()) as { id: string };
    const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/final-approval`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ validationRunId: run.id }) });
    expect(approveRes.status).toBe(201);

    const docForm = new FormData();
    docForm.append("title", "DC1-global.pdf");
    docForm.append("origin", "USER_UPLOAD");
    docForm.append("domain", "TENDER");
    docForm.append("file", new Blob([Buffer.from("contenu réel DC1 global (fixture F2.3.1)")], { type: "application/pdf" }), "DC1-global.pdf");
    const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: docForm });
    expect(docRes.status).toBe(201);
    const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };
    // Item Tender-wide (`lotId: undefined`, jamais un lot) — seul type d'item visible par un dossier
    // GLOBAL (`isRelevantToLot`, voir compute-expected-package-items.ts).
    await prisma.tenderChecklistItem.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId,
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

    // `lotId` OMIS du body -> dossier GLOBAL (`Tous lots (dossier global)`, mission §5/§18).
    const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
    expect(createRpRes.status).toBe(201);
    const rp = (await createRpRes.json()) as { id: string };
    const generated = await buildValidateGenerate(rp.id);

    const legacyPackage = await createPackage(tenderId);

    return { tenderId, legacyPackage, responsePackageId: rp.id, responsePackageVersionId: generated.versionId, responsePackageArtifactId: generated.artifactId, responsePackageArtifactChecksum: generated.checksum };
  }

  describe("Checkpoint TENDEROS-2.1-P2.2-F2 — Response Package V2 connectée à la Submission finale", () => {
    it("TEST HAPPY PATH V2 (mission §57) — a genuinely READY dossier records provenance pointing exactly at the validated CURRENT ResponsePackageVersion/artifact/checksum", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 happy path V2" });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { id: string; status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      // Checkpoint TENDEROS-2.1-P2.2-F2.3 — seedReadyDossier crée un dossier SCOPÉ au lot unique du
      // Tender (jamais un dossier global) : résolution en mode LOT (N=1), la provenance vit donc
      // dans `responsePackages[]`, jamais dans les 3 champs scalaires (réservés au mode GLOBAL).
      expect(submission.responsePackages).toEqual([{ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum }]);

      // Persisté, pas seulement retourné à l'instant T — une relecture réelle le confirme.
      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      expect(persisted.responsePackages).toEqual([expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId })]);
    });

    it("TEST HISTORICAL PROVENANCE (mission §58) — a later rebuild that moves the ResponsePackage's current version forward leaves the already-recorded Submission's provenance untouched", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 provenance historique" });

      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);
      const submission = (await recordRes.json()) as { id: string; responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      expect(submission.responsePackages).toEqual([expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId })]);

      // Rebuild réel : une nouvelle version COURANTE (V2) est produite pour le MÊME ResponsePackage
      // (mission §7 "réutiliser le SOT existant, jamais un nouveau moteur") — le pointeur `currentVersionId`
      // avance, mais la Submission déjà enregistrée reste figée sur la version qui existait au dépôt.
      const rebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(rebuildRes.status).toBe(201);
      const rebuilt = (await rebuildRes.json()) as { version: { id: string; versionNumber: number } };
      expect(rebuilt.version.id).not.toBe(seed.responsePackageVersionId);
      expect(rebuilt.version.versionNumber).toBeGreaterThan(1);

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(persisted.responsePackages).toEqual([{ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum }]);
    });

    /** TEST MISSING ARTIFACT (mission §67, resserré par Checkpoint TENDEROS-2.1-P2.2-F4.1 OPTION C)
     *  — avant F4.1 : un package legacy COMPLETED pouvait exister alors que le dossier V2 restait
     *  validé sans artefact, et c'était `RecordTenderSubmissionUseCase` qui refusait après coup
     *  (`RESPONSE_PACKAGE_ARTIFACT_MISSING`). Depuis F4.1, cette divergence est structurellement
     *  IMPOSSIBLE : `CreateSubmissionPackageUseCase` exige déjà un artefact V2 réel AVANT de créer
     *  quoi que ce soit — aucun package legacy ne peut donc jamais exister dans cet état. Preuve
     *  RENFORCÉE : le refus intervient désormais à la CRÉATION du wrapper, jamais seulement au
     *  dépôt. */
    it("TEST MISSING ARTIFACT (mission §67, resserré F4.1) — a validated CURRENT ResponsePackageVersion with no generated artifact refuses the WRAPPER's creation itself, never only the later deposit", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2 artefact manquant", skipResponsePackageArtifactGeneration: true });
      expect(seed.legacyPackage).toBeUndefined();

      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(422);
      const createPackageBody = (await createPackageRes.json()) as { error: { code: string } };
      expect(createPackageBody.error.code).toBe("PACKAGE_NOT_READY");

      const activeRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const active = (await activeRes.json()) as { canSubmit: boolean; blockers: string[] };
      // Avant F4.1 : la readiness V2 (FIX-A..E) n'exigeait que "validated + CURRENT", jamais
      // l'existence d'un artefact ZIP réellement généré — un package legacy COMPLETED pouvait donc
      // exister sans artefact V2, et `canSubmit` restait `true` alors même que le dépôt réel aurait
      // échoué (`RESPONSE_PACKAGE_ARTIFACT_MISSING`, divergence readiness/dépôt). Depuis F4.1
      // (mission §1 "le dossier certifié par readiness doit être le dossier qui alimente le dépôt"),
      // cette divergence est structurellement CLOSE : la dimension legacy "un package COMPLETED
      // existe" (Sprint 9, `latestCompletedPackage`) ne peut désormais plus jamais être vraie sans
      // artefact V2 — `canSubmit` reflète donc correctement `false`, cohérence améliorée plutôt que
      // régression.
      expect(active.canSubmit).toBe(false);
      expect(active.blockers).toContain("Le package final est introuvable.");
    });

    it("TEST MULTI-LOT HAPPY PATH (mission §45, ex-Checkpoint F2 'TEST MULTI-LOT AMBIGUITY' — F2.3 fait converger ce cas, il n'est plus ambigu ; wrapper N≥2 supporté depuis Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT) — a Tender with two selected lots, each with its own CURRENT/validated/artifact-backed ResponsePackage, resolves BOTH provenances explicitly, never guessing", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 multi-lot happy path" });

      // Second lot, son propre dossier de réponse V2 complet (build -> validate -> generate) — le
      // Tender porte alors DEUX ResponsePackage distincts (un par lot), jamais fusionnés (mission §29).
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const generated2 = await buildValidateGenerate(second.responsePackageId);

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readinessRes.json()) as { readinessStatus: string }).toMatchObject({ readinessStatus: "READY_FOR_SUBMISSION" });

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — le wrapper legacy N=1 créé par
      // `seedReadyDossier` avant l'ajout du second lot est désormais PROUVABLEMENT obsolète (il ne
      // couvre qu'un seul des deux lots requis) : un NOUVEAU package doit être créé, qui couvrira
      // les deux lots.
      const newPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(newPackageRes.status).toBe(201);
      const newPackage = (await newPackageRes.json()) as { id: string };

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { status: string; responsePackageVersionId?: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      // Mode LOT (N=2) — jamais les 3 champs scalaires (réservés au mode GLOBAL).
      expect(submission.responsePackageVersionId).toBeUndefined();
      expect(submission.responsePackages).toEqual(
        expect.arrayContaining([
          { lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum },
          { lotId: second.lotId, responsePackageVersionId: generated2.versionId, responsePackageArtifactId: generated2.artifactId, artifactChecksum: generated2.checksum },
        ]),
      );
      expect(submission.responsePackages).toHaveLength(2);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2.3 — multi-lot: périmètre requis, blocages, races", () => {
    it("TEST NON-SELECTED LOT (mission §46) — a third lot that exists but is NOT selected for response never blocks, even with a stale/missing package", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 lot non sélectionné" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      await buildValidateGenerate(second.responsePackageId);
      // Troisième lot, explicitement NON sélectionné (mission §14/§16) — aucun dossier construit du
      // tout pour lui : ce serait "missing" s'il était requis, mais il ne l'est pas.
      await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: seed.tenderId, lotNumber: "3", title: "Lot non retenu", displayOrder: 2, selectedForResponse: false } });

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readinessRes.json()) as { readinessStatus: string; canSubmit: boolean }).toMatchObject({ readinessStatus: "READY_FOR_SUBMISSION", canSubmit: true });
    });

    it("TEST MISSING REQUIRED LOT (mission §47) — BLOCKED when a required lot has no ResponsePackage built at all", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 lot requis manquant" });
      // Lot sélectionné, mais AUCUN ResponsePackage jamais créé pour lui.
      await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: seed.tenderId, lotNumber: "2", title: "Lot sans dossier", displayOrder: 1, selectedForResponse: true } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_MISSING");
    });

    it("TEST STALE REQUIRED LOT (mission §48) — BLOCKED when one of several required lots is STALE, even though the other is CURRENT", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 lot requis stale" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      await buildValidateGenerate(second.responsePackageId);
      // Un nouvel item MANDATORY apparaît pour le second lot APRÈS build/validate/generate — rend sa
      // version courante STALE (même recette que TEST 6/22), sans toucher au premier lot.
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: second.lotId,
          title: "Attestation ajoutée après coup (lot 2)",
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
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });

    it("TEST UNVALIDATED REQUIRED LOT (mission §49) — BLOCKED when a required lot's dossier was built but never validated", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 lot requis non validé" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${second.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(buildRes.status).toBe(201);
      // Jamais validé, jamais généré.

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_INCOMPLETE");
    });

    it("TEST PARTIAL REBUILD (mission §35/§53) — after lot B's V1 goes stale and is rebuilt to V2, the resolver picks A1+B2, never the stale B1", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 rebuild partiel" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const b1 = await buildValidateGenerate(second.responsePackageId);

      // B devient stale (nouvel item MANDATORY), puis reconstruite -> B2, validée, générée.
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: second.lotId,
          title: "Attestation ajoutée après coup (rebuild)",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "MISSING",
          documentMatchStatus: "NOT_SEARCHED",
        },
      });
      const docForm = new FormData();
      docForm.append("title", "Attestation-lot2.pdf");
      docForm.append("origin", "USER_UPLOAD");
      docForm.append("domain", "TENDER");
      docForm.append("file", new Blob([Buffer.from("contenu réel attestation lot 2")], { type: "application/pdf" }), "Attestation-lot2.pdf");
      const docRes = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: docForm });
      const doc = (await docRes.json()) as { id: string; currentVersion: { id: string } };
      await prisma.tenderChecklistItem.updateMany({
        where: { organizationId: orgAId, tenderId: seed.tenderId, lotId: second.lotId, title: "Attestation ajoutée après coup (rebuild)" },
        data: { documentStatus: "AVAILABLE", matchedDocumentId: doc.id, matchedDocumentVersionId: doc.currentVersion.id, documentMatchStatus: "MANUALLY_ATTACHED" },
      });
      const b2 = await buildValidateGenerate(second.responsePackageId);
      expect(b2.versionId).not.toBe(b1.versionId);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — `seed.legacyPackage` a été créé quand le
      // Tender n'avait qu'UN lot requis (A) : il est désormais PROUVABLEMENT obsolète (il ne couvre
      // pas B) — un nouveau wrapper doit être créé, qui résoudra A1+B2 (jamais la B1 stale).
      const newPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(newPackageRes.status).toBe(201);
      const newPackage = (await newPackageRes.json()) as { id: string };

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      expect(submission.responsePackages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId }),
          expect.objectContaining({ lotId: second.lotId, responsePackageVersionId: b2.versionId }),
        ]),
      );
      expect(submission.responsePackages.find((p) => p.lotId === second.lotId)?.responsePackageVersionId).not.toBe(b1.versionId);
    });

    it("TEST LOT SELECTION RACE (mission §25/§51) — READY with lots A+B, then C is added to the candidature (selectedForResponse=true) with no dossier, then POST is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 race sélection de lot" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      await buildValidateGenerate(second.responsePackageId);
      // Readiness READY à cet instant (A+B tous deux prêts).
      const readinessBefore = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readinessBefore.json()) as { readinessStatus: string }).toMatchObject({ readinessStatus: "READY_FOR_SUBMISSION" });

      // Un troisième lot rejoint la candidature APRÈS coup, sans aucun dossier.
      await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId: seed.tenderId, lotNumber: "3", title: "Lot ajouté après coup", displayOrder: 2, selectedForResponse: true } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_MISSING");
    });

    it("TEST LOT REMOVAL (mission §26/§52) — B blocks while selected; once B is unselected via the real domain operation, A alone makes the dossier READY again", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 retrait de lot" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      // B jamais construit -> bloquant tant qu'il est sélectionné.
      const blockedRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await blockedRes.json()) as { readinessStatus: string }).toMatchObject({ readinessStatus: "BLOCKED" });

      // Retrait RÉEL via l'opération de domaine existante (mission §26 "selon le vrai mécanisme
      // domaine") — jamais une suppression, `selectedForResponse` bascule à false.
      const updateRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/lots/${second.lotId}`, {
        method: "PATCH",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ selectedForResponse: false }),
      });
      expect(updateRes.status).toBe(200);

      const readyRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect((await readyRes.json()) as { readinessStatus: string }).toMatchObject({ readinessStatus: "READY_FOR_SUBMISSION" });
    });

    it("TEST IN-PROGRESS MULTI-LOT PARITY (mission §56/§62) — start() -> recordFromInProgress() produces the exact same multi-lot provenance as a direct record", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3 in-progress multi-lot" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const generated2 = await buildValidateGenerate(second.responsePackageId);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — même raison que TEST MULTI-LOT HAPPY PATH :
      // `seed.legacyPackage` (N=1) est obsolète face au second lot désormais requis, un nouveau
      // wrapper doit être créé pour couvrir les deux.
      const newPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(newPackageRes.status).toBe(201);
      const newPackage = (await newPackageRes.json()) as { id: string };

      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE" }),
      });
      expect(startRes.status).toBe(201);

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      expect(submission.responsePackages).toEqual(
        expect.arrayContaining([
          { lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum },
          { lotId: second.lotId, responsePackageVersionId: generated2.versionId, responsePackageArtifactId: generated2.artifactId, artifactChecksum: generated2.checksum },
        ]),
      );
      expect(submission.responsePackages).toHaveLength(2);
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
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      expect(submission.responsePackages).toEqual([{ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum }]);
    });

    it("TEST IN-PROGRESS HISTORY (mission §33) — a rebuild after recordFromInProgress() leaves the finalized Submission's V1 provenance untouched", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress historique" });
      const started = await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });

      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);

      const rebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(rebuildRes.status).toBe(201);

      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${started.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string }[] };
      expect(persisted.responsePackages).toEqual([expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId })]);
    });

    /** TEST IN-PROGRESS ARTIFACT MISSING (mission §34, resserré par Checkpoint TENDEROS-2.1-P2.2-F4.1
     *  OPTION C) — avant F4.1 : `start()` pouvait pinner un package legacy existant même si le
     *  dossier V2 n'avait pas encore d'artefact, et c'était `recordFromInProgress()` qui refusait
     *  ENSUITE (préservant `SUBMISSION_IN_PROGRESS`). Depuis F4.1, AUCUN package legacy ne peut même
     *  exister dans cet état (voir "TEST MISSING ARTIFACT" ci-dessus) — le flux in-progress est donc
     *  désormais bloqué à sa PROPRE entrée (`start()` lui-même), jamais seulement à sa complétion. */
    it("TEST IN-PROGRESS ARTIFACT MISSING (mission §34, resserré F4.1) — a univoque CURRENT/validated dossier with no generated artifact blocks start() itself (no legacy wrapper can exist), never only recordFromInProgress()", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress artefact manquant", skipResponsePackageArtifactGeneration: true });
      expect(seed.legacyPackage).toBeUndefined();

      const startRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions/start`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: randomUUID(), platform: "PLACE" }),
      });
      expect(startRes.status).toBe(422);
      const body = (await startRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("SUBMISSION_PACKAGE_MISSING");
    });

    it("TEST IN-PROGRESS DCE RACE (mission §35) — READY -> start() -> DCE revision bump -> recordFromInProgress() is refused, exactly like the direct-record race", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress DCE race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("ANALYSIS_STALE");
    });

    it("TEST IN-PROGRESS CANDIDATE RACE (mission §36) — READY -> start() -> Candidate unassigned -> recordFromInProgress() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Candidate race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });
      await prisma.tender.update({ where: { id: seed.tenderId }, data: { candidateCompanyId: null } });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("CANDIDATE_MISSING");
    });

    it("TEST IN-PROGRESS VALIDATION RACE (mission §37) — READY -> start() -> reanalysis leaves the active FinalApproval's captured provenance behind -> recordFromInProgress() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Validation race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });
      await seedSucceededAnalysis({ tenderId: seed.tenderId, analysisVersion: 2, dceRevision: 2 });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("VALIDATION_STALE");
    });

    it("TEST IN-PROGRESS PACKAGE RACE (mission §38) — READY -> start() -> a new mandatory checklist item makes Response Package stale -> recordFromInProgress() is refused, never silently submitting the stale V1", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.1 in-progress Response Package race" });
      await startInProgress({ tenderId: seed.tenderId, packageId: seed.legacyPackage!.id });
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
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.2-F2.3.1 — replace consomme la Submission Readiness backend (ferme le P1 identifié par l'audit F2.3)", () => {
    async function recordFirst(seed: { tenderId: string; legacyPackage: { id: string } | undefined }): Promise<{ id: string }> {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      return (await res.json()) as { id: string };
    }
    async function replaceIt(submissionId: string, packageId: string): Promise<Response> {
      return fetch(`${baseUrl}/api/v1/submissions/${submissionId}/replace`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId, platform: "AWS_ACHAT", submittedAt: new Date().toISOString() }),
      });
    }

    it("TEST 2 — READY, then a DCE revision bump makes Analysis stale, then replace() is refused (same readiness authority as record())", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace Analysis race" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.code).toBe("TENDER_NOT_READY_FOR_SUBMISSION");
      expect(body.error.reasons.map((r) => r.code)).toContain("ANALYSIS_STALE");
    });

    it("TEST 3 — READY, then the Candidate is unassigned (cross-candidate protection), then replace() is refused — F2.3.1 closes the gap where replace() had zero candidate protection", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace Candidate race" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);
      await prisma.tender.update({ where: { id: seed.tenderId }, data: { candidateCompanyId: null } });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("CANDIDATE_MISSING");
    });

    it("TEST 3b (audit F2.3.1 — closes the cross-candidate P2: a package literally captured for a DIFFERENT real candidate, not merely 'candidate removed') — READY for Candidate A, Tender reassigned to a real Candidate B WITHOUT rebuilding the dossier, replace() is refused because the still-current ResponsePackageVersion was captured for A, never silently accepted as B's provenance", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace cross-candidate" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);

      // Candidate B est un candidat RÉEL et DIFFÉRENT (jamais null) — la ResponsePackageVersion
      // actuelle (`currentVersionId`) reste celle bâtie pour A, jamais reconstruite : c'est
      // EXACTEMENT le scénario "provenance d'un autre candidate" que l'audit demande, distinct du
      // TEST 3 ci-dessus (candidat retiré) — ici le candidat existe bel et bien, juste un autre.
      const candidateBId = randomUUID();
      await prisma.candidateCompany.create({ data: { id: candidateBId, organizationId: orgAId, name: `Entreprise Candidate B ${seed.tenderId}`, nameNormalized: `entreprise candidate b ${seed.tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
      await prisma.tender.update({ where: { id: seed.tenderId }, data: { candidateCompanyId: candidateBId } });

      // Preuve directe, au niveau response-package, que la version reste RÉELLEMENT capturée pour A
      // (jamais réécrite rétroactivement) — la staleness vient bien d'une divergence de candidat.
      const versionBefore = await prisma.responsePackageVersion.findUnique({ where: { id: seed.responsePackageVersionId } });
      expect(versionBefore?.candidateCompanyId).not.toBe(candidateBId);

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.code).toBe("TENDER_NOT_READY_FOR_SUBMISSION");
      // Distinct de CANDIDATE_MISSING (TEST 3) : le candidat EXISTE, seule sa provenance V2 est
      // fausse — le signal correct est donc RESPONSE_PACKAGE_STALE (mission "cross-candidate
      // provenance must never become valid"), jamais un dépôt silencieusement accepté pour B avec
      // les artefacts de A.
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");

      // Et le resolver F2/F2.3 lui-même ne doit jamais résoudre cette version comme provenance
      // valide, même s'il était atteint (défense en profondeur, jamais une seule couche de garde).
      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const readiness = (await readinessRes.json()) as { canSubmit: boolean };
      expect(readiness.canSubmit).toBe(false);
    });

    it("TEST 6 — READY, then a reanalysis leaves the active FinalApproval's captured provenance behind (Validation stale), then replace() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace Validation race" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);
      await prisma.dce.update({ where: { id: seed.dceId }, data: { revision: 2 } });
      await seedSucceededAnalysis({ tenderId: seed.tenderId, analysisVersion: 2, dceRevision: 2 });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("VALIDATION_STALE");
    });

    it("TEST 7 — READY, then a new mandatory checklist item makes the Response Package stale, then replace() is refused", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace Response Package race" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);
      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: seed.lotId,
          title: "Attestation ajoutée après coup (replace race)",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "MISSING",
          documentMatchStatus: "NOT_SEARCHED",
        },
      });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });

    it("TEST 8 — multi-lot: READY A+B, then B goes stale, then replace() is refused — no required lot is ever ignored by the readiness guard", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace multi-lot race" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      await buildValidateGenerate(second.responsePackageId);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — `seed.legacyPackage` (N=1) est déjà
      // obsolète face au second lot désormais requis : un nouveau wrapper couvrant A+B est
      // nécessaire pour le premier dépôt réel.
      const initialPackage = await createPackage(seed.tenderId);
      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: initialPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);
      const first = (await recordRes.json()) as { id: string };

      const newPackage = await createPackage(seed.tenderId);

      await prisma.tenderChecklistItem.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          lotId: second.lotId,
          title: "Attestation ajoutée après coup (lot B, replace race)",
          status: "TODO",
          type: "ADMINISTRATIVE_DOCUMENT",
          requirementLevel: "MANDATORY",
          subjectType: "CANDIDATE",
          complianceStatus: "TO_REVIEW",
          documentStatus: "MISSING",
          documentMatchStatus: "NOT_SEARCHED",
        },
      });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string; reasons: { code: string }[] } };
      expect(body.error.reasons.map((r) => r.code)).toContain("RESPONSE_PACKAGE_STALE");
    });

    it("TEST WRONG-LOT REJECTED (audit F2.3.1 — explicitly named, closes the minor KNOWN_GAP) — lot A's package can never be registered under lot B's key, or vice versa, even when both are required and ready simultaneously", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 wrong-lot" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const generated2 = await buildValidateGenerate(second.responsePackageId);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — `seed.legacyPackage` (N=1) est déjà
      // obsolète face au second lot désormais requis : un nouveau wrapper couvrant A+B est
      // nécessaire.
      const newPackage = await createPackage(seed.tenderId);
      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string }[] };

      const forLotA = submission.responsePackages.find((p) => p.lotId === seed.lotId);
      const forLotB = submission.responsePackages.find((p) => p.lotId === second.lotId);
      // Négatif explicite (jamais seulement une égalité positive) : la version de B ne doit JAMAIS
      // apparaître sous la clé A, et réciproquement.
      expect(forLotA?.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(forLotA?.responsePackageVersionId).not.toBe(generated2.versionId);
      expect(forLotB?.responsePackageVersionId).toBe(generated2.versionId);
      expect(forLotB?.responsePackageVersionId).not.toBe(seed.responsePackageVersionId);
    });

    it("TEST 9 — a WARNING-only reason (GO/NO-GO = NO_GO) never blocks replace()", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace warning-only" });
      const first = await recordFirst(seed);
      const newPackage = await createPackage(seed.tenderId);
      await prisma.goNoGoReport.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId: seed.tenderId,
          reportVersion: 1,
          analysisVersion: 1,
          dceRevision: 1,
          candidateCompanyId: seed.candidateCompanyId,
          globalScore: 10,
          confidence: 0.5,
          complexity: 3,
          documentaryLoad: "HIGH",
          estimatedPrepTime: {},
          categoryScores: {},
          recommendation: "NO_GO",
          recommendationRationale: "Score trop faible (fixture F2.3.1).",
          calculationVersion: "v1",
        },
      });

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(201);
      expect((await res.json() as { status: string }).status).toBe("SUBMITTED");
    });

    it("TEST 10/11 — a LOT-mode replacement exposes responsePackages[] identically via GET detail and GET list (detail/list parity)", async () => {
      const seed = await seedReadyDossier({ title: "Marché F2.3.1 replace list parity" });
      const second = await seedSecondLot({ tenderId: seed.tenderId });
      const generated2 = await buildValidateGenerate(second.responsePackageId);

      // Checkpoint TENDEROS-2.1-P2.2-F4.1-CODEX-AUDIT — `seed.legacyPackage` (N=1) est déjà
      // obsolète face au second lot désormais requis : un nouveau wrapper couvrant A+B est
      // nécessaire pour le premier dépôt réel.
      const initialPackage = await createPackage(seed.tenderId);
      const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: initialPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(recordRes.status).toBe(201);
      const first = (await recordRes.json()) as { id: string };

      const newPackage = await createPackage(seed.tenderId);

      const res = await replaceIt(first.id, newPackage.id);
      expect(res.status).toBe(201);
      const replaced = (await res.json()) as { id: string; responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      const expectedProvenance = expect.arrayContaining([
        expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId }),
        expect.objectContaining({ lotId: second.lotId, responsePackageVersionId: generated2.versionId }),
      ]);
      expect(replaced.responsePackages).toEqual(expectedProvenance);
      expect(replaced.responsePackages).toHaveLength(2);

      const detailRes = await fetch(`${baseUrl}/api/v1/submissions/${replaced.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const detail = (await detailRes.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      expect(detail.responsePackages).toEqual(expectedProvenance);

      const listRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const list = (await listRes.json()) as { id: string; responsePackages: { lotId: string; responsePackageVersionId: string }[] }[];
      const listed = list.find((s) => s.id === replaced.id);
      expect(listed?.responsePackages).toEqual(expectedProvenance);
      // Parité stricte : detail et list retournent EXACTEMENT le même contenu (mission §22).
      expect(listed?.responsePackages).toEqual(detail.responsePackages);
    });

    it("TEST 12/17 — a genuinely GLOBAL-mode Submission (0 TenderLot, dossier sans lotId) keeps its provenance in the 3 scalar F2 fields, responsePackages[] stays empty in both GET detail and GET list — never duplicated (mission §12/§17/§20/§30)", async () => {
      const seed = await seedGlobalReadyDossier({ title: "Marché F2.3.1 GLOBAL responsePackages vide" });
      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as {
        id: string;
        status: string;
        responsePackageVersionId?: string;
        responsePackageArtifactId?: string;
        responsePackageArtifactChecksum?: string;
        responsePackages: unknown[];
      };
      expect(submission.status).toBe("SUBMITTED");
      // Mode GLOBAL — provenance F2 classique, jamais dupliquée dans le tableau multi-lot.
      expect(submission.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(submission.responsePackageArtifactId).toBe(seed.responsePackageArtifactId);
      expect(submission.responsePackageArtifactChecksum).toBe(seed.responsePackageArtifactChecksum);
      expect(submission.responsePackages).toEqual([]);

      const detailRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const detail = (await detailRes.json()) as { responsePackageVersionId?: string; responsePackages: unknown[] };
      expect(detail.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(detail.responsePackages).toEqual([]);

      const listRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const list = (await listRes.json()) as { id: string; responsePackageVersionId?: string; responsePackages: unknown[] }[];
      const listed = list.find((s) => s.id === submission.id)!;
      expect(listed.responsePackageVersionId).toBe(seed.responsePackageVersionId);
      expect(listed.responsePackages).toEqual([]);
    });
  });

  it("mission — full lifecycle: readiness -> record -> proof -> confirm receipt -> replace -> reject, with history conserved and the old package reference untouched", async () => {
    const { tenderId, legacyPackage: firstPackage, lotId, responsePackageVersionId, responsePackageArtifactId, responsePackageArtifactChecksum } = await seedReadyDossier({ title: "Marché dépôt complet" });

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { canSubmit: boolean; packageId: string; readinessStatus: string; fileReadinessReasons: { code: string }[] };
    expect(readiness.canSubmit).toBe(true);
    expect(readiness.packageId).toBe(firstPackage!.id);
    expect(readiness.readinessStatus).toBe("READY_FOR_SUBMISSION");
    expect(readiness.fileReadinessReasons).toEqual([]);

    const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: firstPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString(), platformReference: "REF-PLACE-1" }),
    });
    expect(recordRes.status).toBe(201);
    const firstSubmission = (await recordRes.json()) as { id: string; status: string; packageId: string; packageVersion: number };
    expect(firstSubmission.status).toBe("SUBMITTED");
    expect(firstSubmission.packageId).toBe(firstPackage!.id);
    expect(firstSubmission.packageVersion).toBe(firstPackage!.version);

    // Un second enregistrement direct est refusé tant qu'une soumission est déjà en vol.
    const conflictRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: firstPackage!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
    expect(secondPackage.version).toBe(firstPackage!.version + 1);

    const replaceRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}/replace`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: secondPackage.id, platform: "AWS_ACHAT", submittedAt: new Date().toISOString() }),
    });
    expect(replaceRes.status).toBe(201);
    const secondSubmission = (await replaceRes.json()) as { id: string; status: string; supersedesSubmissionId: string; packageId: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
    expect(secondSubmission.status).toBe("SUBMITTED");
    expect(secondSubmission.supersedesSubmissionId).toBe(firstSubmission.id);
    expect(secondSubmission.packageId).toBe(secondPackage.id);
    // Checkpoint TENDEROS-2.1-P2.2-F2.1/F2.3 (ferme le gap identifié par l'audit F2) — le
    // remplacement capture lui aussi la provenance V2, même dossier toujours CURRENT/validé depuis
    // le seed (mode LOT, N=1, comme le reste de seedReadyDossier).
    expect(secondSubmission.responsePackages).toEqual([{ lotId, responsePackageVersionId, responsePackageArtifactId, artifactChecksum: responsePackageArtifactChecksum }]);

    // L'ancienne soumission reste REPLACED, avec SA référence de package d'origine intacte —
    // jamais réécrite rétroactivement (mission §18) — y compris sa PROPRE provenance V2 (capturée
    // au moment du premier record(), jamais réécrite par le replace()).
    const oldRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(oldRes.status).toBe(200);
    const old = (await oldRes.json()) as { status: string; replacedBySubmissionId: string; packageId: string; responsePackages: { lotId: string; responsePackageVersionId: string }[] };
    expect(old.status).toBe("REPLACED");
    expect(old.replacedBySubmissionId).toBe(secondSubmission.id);
    expect(old.packageId).toBe(firstPackage!.id);
    expect(old.responsePackages).toEqual([expect.objectContaining({ lotId, responsePackageVersionId })]);

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
    // Checkpoint TENDEROS-2.1-P2.2-F4.1 — un `packageId` fictif suffit : ce test prouve précisément
    // que ce garde-fou intervient AVANT toute résolution de package (mission §10/§22, jamais changé
    // par F4.1) — un package legacy ne pourrait de toute façon plus être créé sans dossier V2 résolu.

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: randomUUID(), platform: "OTHER", submittedAt: new Date().toISOString() }),
    });
    expect(res.status).toBe(400);
  });

  it("mission §15 — records a withdrawal without deleting the submission, and warns it is not automatic on the buyer platform (frontend-side text)", async () => {
    const { tenderId, legacyPackage: pkg } = await seedReadyDossier({ title: "Marché retrait" });
    const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: pkg!.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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

  /**
   * Checkpoint TENDEROS-2.1-P2.2-F5, mission §24/§25 — scénario E2E de RÉFÉRENCE, absent jusqu'ici :
   * `seedReadyDossier` omet délibérément GO/NO-GO, Mémoire technique et Chiffrage (mission §174
   * "jamais requis quand ils n'existent pas") — ce scénario les inclut TOUS explicitement, pour
   * prouver la convergence complète DCE→Analyse→Checklist→GO/NO-GO→Mémoire technique→Dossier
   * administratif→Chiffrage→Validation→ResponsePackage V2→SubmissionPackage→Readiness→Submission,
   * en passant par les vraies routes HTTP partout où c'est raisonnable (Pricing reste semé
   * directement via Prisma, comme dans `response-package-http.integration.spec.ts` — aucune route
   * HTTP de génération BPU/DPGF/DQE n'existe hors périmètre pricing-schedule lui-même).
   */
  describe("Checkpoint TENDEROS-2.1-P2.2-F5 — E2E convergence de référence (DCE→...→Submission)", () => {
    async function uploadTestDocument(filename: string): Promise<{ documentId: string; documentVersionId: string }> {
      const form = new FormData();
      form.append("title", filename);
      form.append("origin", "USER_UPLOAD");
      form.append("domain", "TENDER");
      form.append("file", new Blob([Buffer.from(`contenu réel ${filename} (fixture F5)`)], { type: "application/pdf" }), filename);
      const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: authHeadersNoContentType(tokenOwnerA, orgAId), body: form });
      expect(res.status).toBe(201);
      const doc = (await res.json()) as { id: string; currentVersion: { id: string } };
      return { documentId: doc.id, documentVersionId: doc.currentVersion.id };
    }

    /** Sème le dossier COMPLET (toutes les dimensions de la Submission Readiness, mission §24) et le
     *  fait converger jusqu'à un SubmissionPackage COMPLETED — READY_FOR_SUBMISSION prouvé par
     *  l'appelant, jamais supposé ici. */
    async function seedFullyConvergedDossier(input: { title: string }): Promise<{
      tenderId: string;
      candidateCompanyId: string;
      lotId: string;
      responsePackageId: string;
      responsePackageVersionId: string;
      responsePackageArtifactId: string;
      responsePackageArtifactChecksum: string;
      legacyPackageId: string;
      pricingScheduleId: string;
      pricingScheduleVersionId: string;
    }> {
      const clientAccountId = randomUUID();
      const tenderId = randomUUID();
      const candidateCompanyId = randomUUID();

      await prisma.candidateCompany.create({ data: { id: candidateCompanyId, organizationId: orgAId, name: `Entreprise Candidate F5 ${tenderId}`, nameNormalized: `entreprise candidate f5 ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
      await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId: orgAId, name: `Client F5 ${tenderId}`, nameNormalized: `client f5 ${tenderId}`, status: "ACTIVE", createdBy: ownerAUserId } });
      await prisma.tender.create({
        data: { id: tenderId, organizationId: orgAId, clientAccountId, candidateCompanyId, title: input.title, status: "IN_ANALYSIS", tags: [], createdBy: ownerAUserId, submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      await prisma.dce.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, status: "IMPORTED", revision: 1, createdByUserId: ownerAUserId } });

      // Analyse CURRENT (analysisVersion=1/dceRevision=1).
      await seedSucceededAnalysis({ tenderId });

      // Checklist réconciliée contre cette analyse — CURRENT.
      const reconcileRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/checklist/reconcile`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
      expect(reconcileRes.status).toBe(200);

      // GO/NO-GO — recommandation GO, provenance alignée sur l'analyse courante (mission §24
      // "GO"), jamais bloquant (mission §34 "NO_GO reste WARNING", ici même pas ce cas).
      await prisma.goNoGoReport.create({
        data: {
          id: randomUUID(),
          organizationId: orgAId,
          tenderId,
          reportVersion: 1,
          analysisVersion: 1,
          dceRevision: 1,
          candidateCompanyId,
          globalScore: 80,
          confidence: 0.9,
          complexity: 2,
          documentaryLoad: "MEDIUM",
          estimatedPrepTime: {},
          categoryScores: {},
          recommendation: "GO",
          recommendationRationale: "Dossier complet, aligné (fixture F5).",
          calculationVersion: "v1",
        },
      });

      // Mémoire technique — flux réel (mission §24 "final/current"), même recette que
      // `response-package-http.integration.spec.ts` TEST TECHNICAL MEMO CHANGE.
      const createMemoRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/technical-memos`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ templateOrigin: "TENDEROS_SYSTEM" }) });
      expect(createMemoRes.status).toBe(201);
      const createdMemo = (await createMemoRes.json()) as { memo: { id: string }; sections: { id: string }[] };
      const prepareRes = await fetch(`${baseUrl}/api/v1/technical-memos/${createdMemo.memo.id}/prepare`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(prepareRes.status).toBe(200);
      for (const section of createdMemo.sections) {
        await prisma.technicalMemoSectionRevision.create({
          data: { id: randomUUID(), organizationId: orgAId, technicalMemoSectionId: section.id, revisionNumber: 1, source: "AI_GENERATED", content: "Contenu suffisant pour l'export (fixture F5).", candidateCompanyId, createdBy: ownerAUserId },
        });
        await prisma.technicalMemoSection.update({ where: { id: section.id }, data: { content: "Contenu suffisant pour l'export (fixture F5).", status: "VALIDATED" } });
      }
      const exportMemoRes = await fetch(`${baseUrl}/api/v1/technical-memos/${createdMemo.memo.id}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
      expect(exportMemoRes.status).toBe(200);

      // Chiffrage (pricing-schedule) — semé directement (aucune route HTTP de génération BPU/DPGF/
      // DQE hors périmètre du module pricing-schedule lui-même, même précédent que
      // `response-package-http.integration.spec.ts` TEST PRICING CHANGE), VALIDATED + fichier final.
      const pricingSourceDoc = await uploadTestDocument("bpu-source-f5.pdf");
      const pricingFinalDoc = await uploadTestDocument("bpu-final-f5.pdf");
      const pricingScheduleId = randomUUID();
      const pricingScheduleVersionId = randomUUID();
      await prisma.pricingSchedule.create({
        data: {
          id: pricingScheduleId,
          organizationId: orgAId,
          tenderId,
          clientAccountId,
          candidateCompanyId,
          financialDocumentType: "BPU",
          sourceDocumentId: pricingSourceDoc.documentId,
          sourceDocumentVersionId: pricingSourceDoc.documentVersionId,
          status: "VALIDATED",
          currentVersionNumber: 1,
          createdBy: ownerAUserId,
        },
      });
      await prisma.pricingScheduleVersion.create({
        data: { id: pricingScheduleVersionId, organizationId: orgAId, pricingScheduleId, versionNumber: 1, status: "VALIDATED", sourceDocumentVersionId: pricingSourceDoc.documentVersionId, createdBy: ownerAUserId, validatedBy: ownerAUserId, validatedAt: new Date() },
      });
      await prisma.pricingSchedule.update({ where: { id: pricingScheduleId }, data: { currentVersionId: pricingScheduleVersionId } });
      await prisma.pricingScheduleFinalFile.create({
        data: { id: randomUUID(), organizationId: orgAId, pricingScheduleVersionId, documentId: pricingFinalDoc.documentId, documentVersionId: pricingFinalDoc.documentVersionId, injectedCellCount: 2, generatedBy: ownerAUserId },
      });

      // Validation — flux réel export/run/final-approval (même recette que `seedReadyDossier`).
      const createTemplateRes = await fetch(`${baseUrl}/api/v1/exports/templates`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentType: "TECHNICAL_MEMO", name: `F5 tpl ${randomUUID()}`, format: "DOCX", config: { sections: [{ id: "SUMMARY", label: "Résumé exécutif", mandatory: true, order: 0 }] } }),
      });
      const template = (await createTemplateRes.json()) as { id: string; versions: { id: string }[] };
      await fetch(`${baseUrl}/api/v1/exports/templates/${template.id}/versions/${template.versions[0]!.id}/activate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      const previewRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/exports/preview`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ exportTemplateId: template.id, sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Contenu du mémoire technique, largement suffisant (fixture F5)." }] }),
      });
      const previewJob = (await previewRes.json()) as { id: string };
      const runRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/validation/run`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ exportJobId: previewJob.id }) });
      const run = (await runRes.json()) as { id: string };
      const approveRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/final-approval`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ validationRunId: run.id }) });
      expect(approveRes.status).toBe(201);

      // Dossier administratif — un lot unique, un item MANDATORY déjà satisfait (mission §7, NEW
      // FLOW candidate-aware — non refait, juste consommé).
      const lot = await prisma.tenderLot.create({ data: { id: randomUUID(), organizationId: orgAId, tenderId, lotNumber: "1", title: "Lot unique F5", displayOrder: 0 } });
      const adminDoc = await uploadTestDocument("DC1-f5.pdf");
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
          matchedDocumentId: adminDoc.documentId,
          matchedDocumentVersionId: adminDoc.documentVersionId,
          documentMatchStatus: "MANUALLY_ATTACHED",
        },
      });

      // ResponsePackage V2 — build/validate/generate réels : administratif + mémoire technique +
      // chiffrage convergent ICI, une seule fois (mission §11 "sources métier assemblées une seule
      // fois").
      const createRpRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/response-packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ lotId: lot.id }) });
      expect(createRpRes.status).toBe(201);
      const rp = (await createRpRes.json()) as { id: string };
      const buildRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(buildRes.status).toBe(201);
      const built = (await buildRes.json()) as { version: { id: string }; items: { category: string; status: string }[] };
      expect(built.items.every((item) => item.status === "READY")).toBe(true);
      // Preuve que les TROIS sources métier (admin + mémoire + chiffrage) sont réellement présentes.
      expect(built.items.some((i) => i.category === "ADMINISTRATIVE")).toBe(true);
      expect(built.items.some((i) => i.category === "TECHNICAL")).toBe(true);
      expect(built.items.some((i) => i.category === "FINANCIAL")).toBe(true);

      const validateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(validateRes.status).toBe(200);
      const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${rp.id}/versions/${built.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(generateRes.status).toBe(201);
      const artifact = (await generateRes.json()) as { id: string; checksum: string };

      // SubmissionPackage wrapper — embarque le PackageArtifact V2 (mission §1 F4.1, jamais une
      // reconstruction métier indépendante).
      const packageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(packageRes.status).toBe(201);
      const legacyPackage = (await packageRes.json()) as { id: string };

      return {
        tenderId,
        candidateCompanyId,
        lotId: lot.id,
        responsePackageId: rp.id,
        responsePackageVersionId: built.version.id,
        responsePackageArtifactId: artifact.id,
        responsePackageArtifactChecksum: artifact.checksum,
        legacyPackageId: legacyPackage.id,
        pricingScheduleId,
        pricingScheduleVersionId,
      };
    }

    it("E2E_CONVERGENCE (mission §24) — a dossier converged across EVERY dimension (GO, Technical Memo, Administrative, Pricing, Validation, ResponsePackage V2, SubmissionPackage) is READY_FOR_SUBMISSION and deposits successfully, with the exact V2 provenance persisted", async () => {
      const seed = await seedFullyConvergedDossier({ title: "Marché F5 convergence complète" });

      const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(readinessRes.status).toBe(200);
      const readiness = (await readinessRes.json()) as { canSubmit: boolean; readinessStatus: string; blockers: string[]; fileReadinessReasons: { code: string; severity: string }[] };
      expect(readiness.readinessStatus).toBe("READY_FOR_SUBMISSION");
      expect(readiness.canSubmit).toBe(true);
      expect(readiness.blockers).toEqual([]);
      expect(readiness.fileReadinessReasons.filter((r) => r.severity === "BLOCKING")).toEqual([]);

      const res = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(res.status).toBe(201);
      const submission = (await res.json()) as { id: string; status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string; artifactChecksum: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      // Mode LOT (un lot unique, mission §5/§18 F2.3) — provenance dans `responsePackages[]`,
      // jamais les 3 champs scalaires (réservés au mode GLOBAL).
      expect(submission.responsePackages).toEqual([{ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId, responsePackageArtifactId: seed.responsePackageArtifactId, artifactChecksum: seed.responsePackageArtifactChecksum }]);

      // Persisté, pas seulement retourné à l'instant T.
      const getRes = await fetch(`${baseUrl}/api/v1/submissions/${submission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const persisted = (await getRes.json()) as { responsePackages: { lotId: string; responsePackageVersionId: string }[] };
      expect(persisted.responsePackages).toEqual([expect.objectContaining({ lotId: seed.lotId, responsePackageVersionId: seed.responsePackageVersionId })]);
    }, 30000);

    it("E2E_MUTATION (mission §25) — after a significant pricing mutation, the old ResponsePackage goes STALE, readiness BLOCKS, the old packageId is refused, then a rebuild + new wrapper succeeds", async () => {
      const seed = await seedFullyConvergedDossier({ title: "Marché F5 mutation chiffrage" });

      // Mutation métier significative : une NOUVELLE génération pour la MÊME version de chiffrage
      // (même recette que `response-package-http.integration.spec.ts` TEST PRICING CHANGE) — rend le
      // ResponsePackage courant STALE sans toucher à rien d'autre.
      const newFinalDoc = await uploadTestDocument("bpu-final-f5-v2.pdf");
      await prisma.pricingScheduleFinalFile.create({
        data: { id: randomUUID(), organizationId: orgAId, pricingScheduleVersionId: seed.pricingScheduleVersionId, documentId: newFinalDoc.documentId, documentVersionId: newFinalDoc.documentVersionId, injectedCellCount: 3, generatedBy: ownerAUserId },
      });

      const blockedReadinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      const blockedReadiness = (await blockedReadinessRes.json()) as { readinessStatus: string; canSubmit: boolean };
      expect(blockedReadiness.readinessStatus).toBe("BLOCKED");
      expect(blockedReadiness.canSubmit).toBe(false);

      // L'ANCIEN wrapper (stampé sur la version désormais STALE) est refusé — jamais un dépôt
      // silencieusement obsolète (mission §1 F4.1 "fail closed").
      const refusedRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: seed.legacyPackageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(refusedRes.status).toBe(422);
      const refusedBody = (await refusedRes.json()) as { error: { code: string } };
      expect(refusedBody.error.code).toBe("TENDER_NOT_READY_FOR_SUBMISSION");

      // Rebuild -> revalidate -> regenerate -> nouveau wrapper -> CURRENT à nouveau.
      const rebuildRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(rebuildRes.status).toBe(201);
      const rebuilt = (await rebuildRes.json()) as { version: { id: string; versionNumber: number } };
      expect(rebuilt.version.id).not.toBe(seed.responsePackageVersionId);
      const revalidateRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/versions/${rebuilt.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(revalidateRes.status).toBe(200);
      const regenerateRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/versions/${rebuilt.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(regenerateRes.status).toBe(201);
      const newArtifact = (await regenerateRes.json()) as { id: string; checksum: string };

      const newPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(newPackageRes.status).toBe(201);
      const newPackage = (await newPackageRes.json()) as { id: string };

      const readyReadinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(((await readyReadinessRes.json()) as { readinessStatus: string }).readinessStatus).toBe("READY_FOR_SUBMISSION");

      const successRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
      });
      expect(successRes.status).toBe(201);
      const submission = (await successRes.json()) as { status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string }[] };
      expect(submission.status).toBe("SUBMITTED");
      const row = submission.responsePackages.find((p) => p.lotId === seed.lotId);
      expect(row?.responsePackageVersionId).toBe(rebuilt.version.id);
      expect(row?.responsePackageArtifactId).toBe(newArtifact.id);
    }, 30000);

    /**
     * Checkpoint TENDEROS-2.1-CCV2-E.3 — PREUVE REINE `CCV2_E2E_CONVERGENCE`.
     *
     * Une seule chaîne runtime, par les routes produit réelles : dossier convergé sur Candidate A,
     * changement OFFICIEL de candidat vers B, démonstration que plus rien de A ne permet de
     * déposer, puis reconvergence sur B jusqu'au dépôt réussi et au débit d'EXACTEMENT un crédit.
     *
     * Les sentinelles ALPHA/BETA sont uniques : chaque assertion d'absence est doublée d'un témoin
     * positif, faute de quoi elle serait satisfaite par un artefact vide.
     */
    describe("Checkpoint TENDEROS-2.1-CCV2-E.3 — CCV2_E2E_CONVERGENCE (Candidate A vers B vers Submission)", () => {
      async function setBalance(balance: number): Promise<void> {
        await prisma.organizationAoCreditBalance.upsert({
          where: { organizationId: orgAId },
          create: { id: randomUUID(), organizationId: orgAId, balance },
          update: { balance },
        });
      }
      async function getBalance(): Promise<number> {
        const row = await prisma.organizationAoCreditBalance.findUnique({ where: { organizationId: orgAId } });
        return row?.balance ?? 0;
      }

      /** Change le candidat par la ROUTE OFFICIELLE — jamais un UPDATE Prisma direct (mission §6). */
      async function switchCandidate(tenderId: string, candidateCompanyId: string): Promise<Response> {
        return fetch(`${baseUrl}/api/v1/tenders/${tenderId}/candidate-company`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ candidateCompanyId }),
        });
      }

      async function readReadiness(tenderId: string) {
        const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
        return (await res.json()) as { canSubmit: boolean; readinessStatus: string; blockers: string[] };
      }

      it("CCV2_E2E_CONVERGENCE — dossier A convergé, switch A vers B, aucun artefact A ne permet le dépôt (0 crédit), reconvergence B, dépôt réussi (exactement 1 crédit), rejeu sans second débit", async () => {
        // ---------- CHAÎNE A ----------
        const seed = await seedFullyConvergedDossier({ title: "CCV2-E3 ALPHA CCV2 E3" });
        const candidateA = seed.candidateCompanyId;

        // Candidate B, identité VOLONTAIREMENT incompatible, même organisation.
        const candidateB = randomUUID();
        await prisma.candidateCompany.create({
          data: { id: candidateB, organizationId: orgAId, name: "BETA CCV2 E3", nameNormalized: `beta ccv2 e3 ${candidateB}`, legalName: "BETA CCV2 E3", status: "ACTIVE", createdBy: ownerAUserId },
        });

        // ÉTAT A cohérent : le dossier est déposable AVANT tout changement.
        const readinessA = await readReadiness(seed.tenderId);
        expect(readinessA.readinessStatus).toBe("READY_FOR_SUBMISSION");
        expect(readinessA.canSubmit).toBe(true);

        // La version A porte bien le candidat A — témoin POSITIF.
        const versionABefore = await prisma.responsePackageVersion.findUnique({ where: { id: seed.responsePackageVersionId } });
        expect(versionABefore?.candidateCompanyId).toBe(candidateA);

        // ---------- SWITCH OFFICIEL A vers B ----------
        const switchRes = await switchCandidate(seed.tenderId, candidateB);
        expect(switchRes.status).toBe(200);
        expect((await prisma.tender.findUnique({ where: { id: seed.tenderId } }))?.candidateCompanyId).toBe(candidateB);

        // ---------- PREUVE COMPORTEMENTALE ----------
        const readinessAfterSwitch = await readReadiness(seed.tenderId);
        const blockedAfterSwitch = readinessAfterSwitch.canSubmit === false;

        // AO CREDIT NÉGATIF — tentative de dépôt avec l'ancien package A.
        await setBalance(5);
        const balanceBefore = await getBalance();
        const staleDepositRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ packageId: seed.legacyPackageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
        });
        const balanceAfterStaleAttempt = await getBalance();

        // INVARIANT ABSOLU : un dépôt refusé ne consomme JAMAIS de crédit.
        if (staleDepositRes.status >= 400) {
          expect(balanceAfterStaleAttempt).toBe(balanceBefore);
        }
        // L'artefact A ne peut pas servir B : soit la readiness bloque, soit le dépôt est refusé.
        expect(blockedAfterSwitch || staleDepositRes.status >= 400).toBe(true);

        // ---------- RECONVERGENCE B ----------
        // Le produit exige de reconstruire TOUT ce que le changement de candidat a invalidé — trois
        // blocages remontés par le Final Guard : GONOGO_STALE, TECHNICAL_MEMO_STALE,
        // VALIDATION_STALE. C'est plus large qu'une simple mutation de chiffrage (E2E_MUTATION, qui
        // ne demandait qu'un rebuild de package), et c'est correct : changer d'entreprise candidate
        // invalide l'évaluation d'opportunité, le discours technique et l'approbation finale.

        // 1. GO/NO-GO recalculé POUR LE CANDIDAT COURANT (nouvelle version, l'ancienne est conservée).
        await prisma.goNoGoReport.create({
          data: {
            id: randomUUID(),
            organizationId: orgAId,
            tenderId: seed.tenderId,
            reportVersion: 2,
            analysisVersion: 1,
            dceRevision: 1,
            candidateCompanyId: candidateB,
            globalScore: 80,
            confidence: 0.9,
            complexity: 2,
            documentaryLoad: "MEDIUM",
            estimatedPrepTime: {},
            categoryScores: {},
            recommendation: "GO",
            recommendationRationale: "Dossier réévalué pour BETA CCV2 E3 (CCV2-E.3).",
            calculationVersion: "v1",
          },
        });

        // 2. Mémoire technique régénérée pour B : nouvelles révisions estampillées B, puis export.
        const memoRow = await prisma.technicalMemo.findFirst({ where: { organizationId: orgAId, tenderId: seed.tenderId } });
        expect(memoRow).not.toBeNull();
        const memoSections = await prisma.technicalMemoSection.findMany({ where: { technicalMemoId: memoRow!.id } });
        for (const section of memoSections) {
          const previous = await prisma.technicalMemoSectionRevision.findFirst({ where: { technicalMemoSectionId: section.id }, orderBy: { revisionNumber: "desc" } });
          await prisma.technicalMemoSectionRevision.create({
            data: {
              id: randomUUID(),
              organizationId: orgAId,
              technicalMemoSectionId: section.id,
              revisionNumber: (previous?.revisionNumber ?? 0) + 1,
              source: "AI_GENERATED",
              content: "Contenu rédigé pour BETA CCV2 E3 (CCV2-E.3).",
              candidateCompanyId: candidateB,
              createdBy: ownerAUserId,
            },
          });
          await prisma.technicalMemoSection.update({ where: { id: section.id }, data: { content: "Contenu rédigé pour BETA CCV2 E3 (CCV2-E.3).", status: "VALIDATED" } });
        }
        const reExportRes = await fetch(`${baseUrl}/api/v1/technical-memos/${memoRow!.id}/export`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({}) });
        expect(reExportRes.status).toBe(200);

        // 3. Revalidation + nouvelle approbation finale, par les routes réelles.
        // Le gabarit d'export actif est celui créé par le seed — réutilisé, jamais recréé.
        const exportTemplate = await prisma.exportTemplate.findFirst({ where: { organizationId: orgAId }, orderBy: { createdAt: "desc" } });
        expect(exportTemplate).not.toBeNull();
        const rePreviewRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/exports/preview`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({
            exportTemplateId: exportTemplate!.id,
            sections: [{ sectionId: "SUMMARY", sourceType: "MANUAL", manualContent: "Mémoire technique rédigé pour BETA CCV2 E3, largement suffisant pour éviter tout avertissement de longueur." }],
          }),
        });
        if (rePreviewRes.status !== 201) {
          throw new Error(`Preview export refusé — HTTP ${rePreviewRes.status} : ${await rePreviewRes.clone().text()}`);
        }
        const rePreviewJob = (await rePreviewRes.json()) as { id: string };
        const reRunRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/validation/run`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ exportJobId: rePreviewJob.id }) });
        expect(reRunRes.status).toBe(201);
        const reRun = (await reRunRes.json()) as { id: string };
        const reApproveRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/final-approval`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId), body: JSON.stringify({ validationRunId: reRun.id }) });
        expect(reApproveRes.status).toBe(201);

        // 4. Response Package reconstruit.
        const rebuiltPackage = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        expect(rebuiltPackage.status).toBe(201);
        const rebuilt = (await rebuiltPackage.json()) as { version: { id: string } };
        await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/versions/${rebuilt.version.id}/validate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        const generateRes = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/versions/${rebuilt.version.id}/generate`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        expect({ step: "generate", status: generateRes.status, body: await generateRes.clone().text() }).toMatchObject({ status: 201 });
        const newArtifact = (await generateRes.json()) as { id: string };

        // La version reconstruite porte le candidat COURANT (B), jamais A.
        const rebuiltRow = await prisma.responsePackageVersion.findUnique({ where: { id: rebuilt.version.id } });
        expect(rebuiltRow?.candidateCompanyId).toBe(candidateB);

        // La version A reste historiquement A — aucune mutation rétroactive.
        const versionA = await prisma.responsePackageVersion.findUnique({ where: { id: seed.responsePackageVersionId } });
        expect(versionA?.candidateCompanyId).toBe(candidateA);
        expect(versionA?.id).not.toBe(rebuilt.version.id);

        const newPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        expect({ step: "packages", status: newPackageRes.status, body: await newPackageRes.clone().text() }).toMatchObject({ status: 201 });
        const newPackage = (await newPackageRes.json()) as { id: string };

        // ---------- DÉPÔT B ----------
        // L'organisation de ce harnais est ENTERPRISE, dont le quota `AoMonthlyGrant` vaut
        // UNLIMITED : `ConsumeAoCreditUseCase` ne décrémente alors AUCUN ledger (fair-use illimité,
        // comportement produit délibéré). Pour MESURER un débit, il faut un plan compté — on bascule
        // donc temporairement sur STARTER, exactement comme la preuve déjà certifiée
        // `ao-credit-consumption-http.integration.spec.ts`, puis on restaure le plan d'origine.
        // Aucun bypass de facturation, aucun backdoor Stripe : seul le PLAN change.
        await prisma.organizationSubscription.updateMany({ where: { organizationId: orgAId }, data: { planTier: "STARTER" } });
        try {
        await setBalance(3);
        const balanceBeforeSuccess = await getBalance();
        const successRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
        });
        const successBody = await successRes.clone().text();
        if (successRes.status !== 201) {
          throw new Error(`Dépôt B refusé — HTTP ${successRes.status} : ${successBody}`);
        }
        const submission = (await successRes.json()) as { id: string; status: string; responsePackages: { lotId: string; responsePackageVersionId: string; responsePackageArtifactId: string }[] };
        expect(submission.status).toBe("SUBMITTED");

        // PROVENANCE PERSISTÉE : exactement la version et l'artefact reconstruits pour B.
        const provenance = submission.responsePackages.find((row) => row.lotId === seed.lotId);
        expect(provenance?.responsePackageVersionId).toBe(rebuilt.version.id);
        expect(provenance?.responsePackageArtifactId).toBe(newArtifact.id);
        expect(provenance?.responsePackageVersionId).not.toBe(seed.responsePackageVersionId);

        // AO CREDIT POSITIF : exactement UN débit.
        const balanceAfterSuccess = await getBalance();
        expect(balanceAfterSuccess).toBe(balanceBeforeSuccess - 1);

        // REJEU / double-clic : aucun second débit.
        const replayRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ packageId: newPackage.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
        });
        expect(await getBalance()).toBe(balanceAfterSuccess);
        expect([201, 409, 422]).toContain(replayRes.status);

        // ---------- HISTORIQUE ----------
        expect(await prisma.responsePackageVersion.count({ where: { id: seed.responsePackageVersionId } })).toBe(1);
        } finally {
          await prisma.organizationSubscription.updateMany({ where: { organizationId: orgAId }, data: { planTier: "ENTERPRISE" } });
        }
      }, 120000);
    });

    /**
     * Checkpoint TENDEROS-2.1-CCV2-E.4 — `CCV2_E_MULTI_LOT_CANDIDATE_SWITCH`.
     *
     * Frontières prouvées en runtime : un artefact ne franchit jamais NI la frontière de lot, NI la
     * frontière de candidat. Réutilise le harnais existant (`seedFullyConvergedDossier`,
     * `seedSecondLot`) — aucune fixture parallèle.
     */
    describe("Checkpoint TENDEROS-2.1-CCV2-E.4 — CCV2_E_MULTI_LOT_CANDIDATE_SWITCH", () => {
      it("multi-lot sous changement de candidat : aucun artefact ne franchit la frontière de lot ni celle de candidat", async () => {
        const seed = await seedFullyConvergedDossier({ title: "CCV2-E4 multi-lot ALPHA" });
        const candidateA = seed.candidateCompanyId;
        const lot1 = seed.lotId;

        const candidateB = randomUUID();
        await prisma.candidateCompany.create({
          data: { id: candidateB, organizationId: orgAId, name: "BETA CCV2 E4 ML", nameNormalized: `beta-ccv2-e4-ml-${candidateB}`, legalName: "BETA CCV2 E4 ML", status: "ACTIVE", createdBy: ownerAUserId },
        });

        // Lot 2 avec son PROPRE Response Package, mené jusqu'à un artefact valide.
        const second = await seedSecondLot({ tenderId: seed.tenderId });
        const lot2Built = await buildValidateGenerate(second.responsePackageId);

        // Témoins POSITIFS avant switch : chaque lot a sa propre version, rattachée au candidat A.
        const lot1VersionA = await prisma.responsePackageVersion.findUnique({ where: { id: seed.responsePackageVersionId } });
        const lot2VersionA = await prisma.responsePackageVersion.findUnique({ where: { id: lot2Built.versionId } });
        expect(lot1VersionA?.candidateCompanyId).toBe(candidateA);
        expect(lot2VersionA?.candidateCompanyId).toBe(candidateA);
        expect(lot1VersionA?.id).not.toBe(lot2VersionA?.id);

        // Chaque Response Package est structurellement lié à SON lot — jamais partagé.
        const rpLot1 = await prisma.responsePackage.findUnique({ where: { id: seed.responsePackageId } });
        const rpLot2 = await prisma.responsePackage.findUnique({ where: { id: second.responsePackageId } });
        expect(rpLot1?.lotId).toBe(lot1);
        expect(rpLot2?.lotId).toBe(second.lotId);
        expect(rpLot1?.lotId).not.toBe(rpLot2?.lotId);

        // ---------- SWITCH OFFICIEL A -> B ----------
        const switchRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/candidate-company`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ candidateCompanyId: candidateB }),
        });
        expect(switchRes.status).toBe(200);

        // CASE ML-1 — l'artefact Lot1 du candidat A ne permet plus de déposer pour B.
        const staleDeposit = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submissions`, {
          method: "POST",
          headers: authHeaders(tokenOwnerA, orgAId),
          body: JSON.stringify({ packageId: seed.legacyPackageId, platform: "PLACE", submittedAt: new Date().toISOString() }),
        });
        expect(staleDeposit.status).toBeGreaterThanOrEqual(400);

        // CASE ML-2 — le Response Package du Lot 1 ne peut pas être réaffecté au Lot 2 : la liaison
        // au lot est portée par la ligne elle-même, jamais fournie par l'appelant.
        expect(rpLot1?.lotId).not.toBe(second.lotId);
        const lot2Packages = await prisma.responsePackage.findMany({ where: { organizationId: orgAId, tenderId: seed.tenderId, lotId: second.lotId } });
        expect(lot2Packages.map((row) => row.id)).toEqual([second.responsePackageId]);
        expect(lot2Packages.map((row) => row.id)).not.toContain(seed.responsePackageId);

        // CASE ML-3 — Lot 1 reconstruit pour B redevient exploitable, estampillé B.
        const rebuiltLot1 = await fetch(`${baseUrl}/api/v1/response-packages/${seed.responsePackageId}/build`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
        expect(rebuiltLot1.status).toBe(201);
        const lot1B = (await rebuiltLot1.json()) as { version: { id: string } };
        const lot1VersionB = await prisma.responsePackageVersion.findUnique({ where: { id: lot1B.version.id } });
        expect(lot1VersionB?.candidateCompanyId).toBe(candidateB);
        expect(lot1VersionB?.id).not.toBe(seed.responsePackageVersionId);

        // CASE ML-4 — le rebuild du Lot 1 ne rend PAS le Lot 2 courant : la version du Lot 2 reste
        // celle du candidat A, aucune version B n'a été créée pour lui.
        const lot2AfterLot1Rebuild = await prisma.responsePackageVersion.findMany({ where: { responsePackageId: second.responsePackageId } });
        expect(lot2AfterLot1Rebuild.map((row) => row.id)).toEqual([lot2Built.versionId]);
        expect(lot2AfterLot1Rebuild.every((row) => row.candidateCompanyId === candidateA)).toBe(true);

        // CASE ML-7 — l'artefact Lot2 du candidat A n'a jamais été réattribué à B.
        expect(lot2AfterLot1Rebuild.some((row) => row.candidateCompanyId === candidateB)).toBe(false);

        // CASE ML-5 — le Final Guard raisonne lot par lot : il bloque encore, et cite le Lot 2 resté
        // sur le candidat A, jamais le Lot 1 qui vient d'être reconstruit.
        const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${seed.tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
        expect(readinessRes.status).toBe(200);
        const readinessBody = (await readinessRes.json()) as { canSubmit: boolean; fileReadinessReasons: { code: string; severity: string; lotId?: string }[] };
        expect(readinessBody.canSubmit).toBe(false);

        // CASE ML-6 — la provenance de dépôt reste strictement scopée au Tender ET au lot : aucune
        // soumission n'a pu être créée pour CE Tender pendant l'état incohérent, donc aucune
        // provenance croisée n'existe. Le compteur est borné au Tender de CETTE preuve — les autres
        // tests du fichier créent légitimement leurs propres soumissions.
        expect(await prisma.tenderSubmission.count({ where: { organizationId: orgAId, tenderId: seed.tenderId } })).toBe(0);

        // Historique intact : les deux versions du candidat A existent toujours, inchangées.
        expect(await prisma.responsePackageVersion.findUnique({ where: { id: seed.responsePackageVersionId } })).toEqual(lot1VersionA);
        expect(await prisma.responsePackageVersion.findUnique({ where: { id: lot2Built.versionId } })).toEqual(lot2VersionA);
      }, 120000);
    });
  });
});
