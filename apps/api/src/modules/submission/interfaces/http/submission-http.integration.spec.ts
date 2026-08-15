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
    await prisma.documentVersion.deleteMany({ where: { organizationId: orgAId } });
    await prisma.document.deleteMany({ where: { organizationId: orgAId } });
    await prisma.tender.deleteMany({ where: { organizationId: orgAId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: orgAId } });
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

  it("mission — full lifecycle: readiness -> record -> proof -> confirm receipt -> replace -> reject, with history conserved and the old package reference untouched", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché dépôt complet", submissionDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    const firstPackage = await createPackage(tenderId);

    const readinessRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-readiness`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(readinessRes.status).toBe(200);
    const readiness = (await readinessRes.json()) as { canSubmit: boolean; packageId: string; readinessStatus: string };
    expect(readiness.canSubmit).toBe(true);
    expect(readiness.packageId).toBe(firstPackage.id);
    expect(readiness.readinessStatus).toBe("READY_FOR_SUBMISSION");

    const capabilitiesRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submission-capabilities`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(capabilitiesRes.status).toBe(200);
    const capabilities = (await capabilitiesRes.json()) as { canRecordSubmission: boolean };
    expect(capabilities.canRecordSubmission).toBe(true);

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
    const secondSubmission = (await replaceRes.json()) as { id: string; status: string; supersedesSubmissionId: string; packageId: string };
    expect(secondSubmission.status).toBe("SUBMITTED");
    expect(secondSubmission.supersedesSubmissionId).toBe(firstSubmission.id);
    expect(secondSubmission.packageId).toBe(secondPackage.id);

    // L'ancienne soumission reste REPLACED, avec SA référence de package d'origine intacte —
    // jamais réécrite rétroactivement (mission §18).
    const oldRes = await fetch(`${baseUrl}/api/v1/submissions/${firstSubmission.id}`, { headers: authHeaders(tokenOwnerA, orgAId) });
    expect(oldRes.status).toBe(200);
    const old = (await oldRes.json()) as { status: string; replacedBySubmissionId: string; packageId: string };
    expect(old.status).toBe("REPLACED");
    expect(old.replacedBySubmissionId).toBe(secondSubmission.id);
    expect(old.packageId).toBe(firstPackage.id);

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

  it("mission §29 — refuses to record a submission against a package that is no longer the latest COMPLETED version", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché package obsolète" });
    const outdated = await createPackage(tenderId);
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

  it("mission §29 (correctif audit Codex P1) — refuses to complete a SUBMISSION_IN_PROGRESS deposit if the pinned package became obsolete since start", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché dépôt en cours devenu obsolète" });
    const startedPackage = await createPackage(tenderId);

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

  it("mission §28 — refuses a submission recorded after the deadline, never silently", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché échéance dépassée", submissionDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000) });
    const pkg = await createPackage(tenderId);

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: pkg.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SUBMISSION_DEADLINE_PASSED");
  });

  it("mission §10/§22 — refuses platform OTHER without a custom name (400)", async () => {
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
    const { tenderId } = await seedApprovedTender({ title: "Marché retrait" });
    const pkg = await createPackage(tenderId);
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

  it("mission §30 — multi-tenant isolation: org B never sees org A's readiness, submissions, or a cross-org submission id (404, never revealing existence)", async () => {
    const { tenderId } = await seedApprovedTender({ title: "Marché isolation" });
    const pkg = await createPackage(tenderId);
    const recordRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/submissions`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
      body: JSON.stringify({ packageId: pkg.id, platform: "PLACE", submittedAt: new Date().toISOString() }),
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
