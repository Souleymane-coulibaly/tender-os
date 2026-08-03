import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
// Accès direct au repository Prisma de Memberships réservé à ce test (même contournement que
// dce-http.integration.spec.ts / extraction-http.integration.spec.ts) : il n'existe aucune API
// publique pour créer la toute première Membership ADMIN d'une organisation.
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { buildMinimalPdf } from "../../../extraction/test-support/pdf-fixture-builder";

type AnalysisSummary = {
  id: string;
  scope: string;
  status: string;
  analysisVersion: number;
  extractionVersion?: number;
  errorCode?: string;
};

/**
 * Preuve réelle contre HTTP + PostgreSQL (mission Sprint 4.1, même motif que
 * extraction-http.integration.spec.ts, module Extraction) — jamais un mock du pipeline, une vraie
 * requête HTTP contre un vrai NestJS + une vraie base. Aucune clé IA n'est configurée dans cet
 * environnement de test (AI_PROVIDER absent de .env) : chaque analyse déclenchée se termine donc de
 * façon déterministe en FAILED/AI_PROVIDER_NOT_CONFIGURED — c'est exactement le comportement que la
 * mission §"Configuration" exige ("Aucune variable obligatoire ne doit faire crasher... l'appel
 * d'analyse doit retourner une erreur propre").
 */
describe("Analysis — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenAdminA: string;
  let tokenReadOnlyA: string;
  let tokenOwnerA: string;
  let tokenAdminB: string;
  let tokenOwnerB: string;

  let tenderAId: string;
  let tenderBId: string;
  let extractedDocumentId: string;
  let unextractedDocumentId: string;
  let ownerExtractedDocumentId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "Analysis HTTP Test" }),
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

  async function addMembership(input: {
    organizationId: string;
    userId: string;
    role: (typeof OrganizationRole)[keyof typeof OrganizationRole];
  }): Promise<void> {
    const membershipRepository = new PrismaMembershipRepository(prisma);
    await membershipRepository.save(
      OrganizationMembership.create({
        id: MembershipId.from(randomUUID()),
        organizationId: input.organizationId,
        userId: input.userId,
        role: input.role,
        occurredAt: new Date(),
      }),
    );
  }

  function authHeaders(token: string, organizationId: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, "X-Organization-Id": organizationId };
  }

  async function ensureDce(tenderId: string, token: string, organizationId: string): Promise<void> {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token, organizationId) },
    });
    expect(res.status).toBe(201);
  }

  async function importPdf(input: { tenderId: string; token: string; organizationId: string; filename: string }): Promise<string> {
    const form = new FormData();
    form.append(
      "files",
      new Blob([buildMinimalPdf([`Real extractable native PDF text for analysis HTTP test ${randomUUID()}.`])], {
        type: "application/pdf",
      }),
      input.filename,
    );
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: { documentId: string }[] };
    expect(body.accepted).toHaveLength(1);
    return body.accepted[0]!.documentId;
  }

  async function waitForTerminalExtraction(tenderId: string, documentId: string, token: string, organizationId: string): Promise<void> {
    const terminal = new Set(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "NOT_PROCESSABLE"]);
    const deadline = Date.now() + 20000;
    for (;;) {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/dce/documents/${documentId}/extraction`, {
        headers: authHeaders(token, organizationId),
      });
      const body = (await res.json()) as { status: string };
      if (terminal.has(body.status)) {
        expect(body.status).toBe("SUCCEEDED");
        return;
      }
      if (Date.now() > deadline) throw new Error(`Extraction did not reach a terminal status in time (last: ${body.status})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  async function getAnalysis(analysisId: string, token: string, organizationId: string) {
    const res = await fetch(`${baseUrl}/api/v1/analyses/${analysisId}`, { headers: authHeaders(token, organizationId) });
    return { status: res.status, body: (await res.json()) as AnalysisSummary & { error?: { code: string } } };
  }

  async function waitForTerminalAnalysis(analysisId: string, token: string, organizationId: string): Promise<AnalysisSummary> {
    const terminal = new Set(["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED"]);
    const deadline = Date.now() + 20000;
    for (;;) {
      const { body } = await getAnalysis(analysisId, token, organizationId);
      if (terminal.has(body.status)) return body;
      if (Date.now() > deadline) throw new Error(`Analysis ${analysisId} did not reach a terminal status in time (last: ${body.status})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
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

    await prisma.organization.create({
      data: { id: orgAId, name: "Analysis Org A HTTP", slug: `analysis-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });
    await prisma.organization.create({
      data: { id: orgBId, name: "Analysis Org B HTTP", slug: `analysis-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
    });

    const adminA = await registerAndLogin(`analysis-admin-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`analysis-readonly-a-${randomUUID()}@smoke.test`);
    const ownerA = await registerAndLogin(`analysis-owner-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`analysis-admin-b-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`analysis-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(adminA.userId, readOnlyA.userId, ownerA.userId, adminB.userId, ownerB.userId);
    tokenAdminA = adminA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenOwnerA = ownerA.token;
    tokenAdminB = adminB.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: adminA.userId, role: OrganizationRole.OrganizationAdmin });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    const clientAccountA = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        name: "Client de test A",
        nameNormalized: "client de test a",
        status: "ACTIVE",
        createdBy: adminA.userId,
      },
    });
    const clientAccountB = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId: orgBId,
        name: "Client de test B",
        nameNormalized: "client de test b",
        status: "ACTIVE",
        createdBy: adminB.userId,
      },
    });

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderAId, organizationId: orgAId, clientAccountId: clientAccountA.id, title: "Tender A — Analysis HTTP", status: "DRAFT", tags: [], createdBy: adminA.userId },
    });
    tenderBId = randomUUID();
    await prisma.tender.create({
      data: { id: tenderBId, organizationId: orgBId, clientAccountId: clientAccountB.id, title: "Tender B — Analysis HTTP", status: "DRAFT", tags: [], createdBy: adminB.userId },
    });

    await ensureDce(tenderAId, tokenAdminA, orgAId);
    await ensureDce(tenderBId, tokenAdminB, orgBId);

    extractedDocumentId = await importPdf({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, filename: "cctp.pdf" });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents/${extractedDocumentId}/extraction`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    await waitForTerminalExtraction(tenderAId, extractedDocumentId, tokenAdminA, orgAId);

    unextractedDocumentId = await importPdf({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, filename: "ccap.pdf" });
    // Mission Sprint 8A.2 (correction bug #2 élargie — "aucun déclencheur d'extraction") —
    // l'import DCE déclenche désormais lui-même une extraction en meilleur effort
    // (`AutoTriggerDocumentExtractionUseCase`), qui réussit ici (PDF fixture valide) avant même
    // que ce test ne s'exécute. Supprime cette extraction auto-déclenchée pour restaurer
    // délibérément l'état "jamais extrait" que CE test précis veut exercer — jamais une
    // régression du comportement réel, seulement la fixture qui doit refléter le nouveau
    // comportement par défaut.
    await prisma.documentExtraction.delete({ where: { documentId: unextractedDocumentId } });

    // Document dédié, extrait avec succès, réservé aux tests OWNER document-scope — jamais
    // `extractedDocumentId` (déjà porteur de plusieurs AnalysisJob créés par d'autres tests de ce
    // fichier), pour ne jamais heurter la garde "double déclenchement" par accident.
    ownerExtractedDocumentId = await importPdf({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, filename: "ae.pdf" });
    await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents/${ownerExtractedDocumentId}/extraction`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    await waitForTerminalExtraction(tenderAId, ownerExtractedDocumentId, tokenAdminA, orgAId);
  }, 60000);

  afterAll(async () => {
    // Audit Codex P1-4 — RoutingPolicyBridgeModule est câblé dans l'app réelle : une décision de
    // routage durable est créée pour chaque job traité par ces tests, jamais nettoyée par les
    // suppressions "métier" ci-dessous (routing_decisions n'est référencée par aucune d'elles).
    await prisma.routingDecision.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisAttempt.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.analysisJob.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.extractionChunk.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.extractionAttempt.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentExtraction.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.updateMany({ where: { organizationId: { in: [orgAId, orgBId] } }, data: { currentVersionId: null } });
    await prisma.document.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.tender.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.clientAccount.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.membershipRole.deleteMany({ where: { membership: { organizationId: { in: [orgAId, orgBId] } } } });
    await prisma.organizationMembership.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await app.close();
  }, 30000);

  it("starts a DOCUMENT-scope analysis (202) that ends up FAILED/AI_PROVIDER_NOT_CONFIGURED (no key in this environment)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/documents/${extractedDocumentId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(startRes.status).toBe(202);
    const started = (await startRes.json()) as AnalysisSummary;
    expect(started.scope).toBe("DOCUMENT");
    expect(started.analysisVersion).toBe(1);
    expect(started.extractionVersion).toBeGreaterThanOrEqual(1);

    const final = await waitForTerminalAnalysis(started.id, tokenAdminA, orgAId);
    expect(final.status).toBe("FAILED");
    expect(final.errorCode).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("starts a TENDER-scope analysis (202) that also ends up FAILED/AI_PROVIDER_NOT_CONFIGURED", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(startRes.status).toBe(202);
    const started = (await startRes.json()) as AnalysisSummary;
    expect(started.scope).toBe("TENDER");

    const final = await waitForTerminalAnalysis(started.id, tokenAdminA, orgAId);
    expect(final.status).toBe("FAILED");
    expect(final.errorCode).toBe("AI_PROVIDER_NOT_CONFIGURED");
  });

  it("retries a FAILED analysis: same id and version, still FAILED (no key), attemptCount grows", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const started = (await startRes.json()) as AnalysisSummary;
    const first = await waitForTerminalAnalysis(started.id, tokenAdminA, orgAId);
    expect(first.status).toBe("FAILED");

    const retryRes = await fetch(`${baseUrl}/api/v1/analyses/${started.id}/retry`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(retryRes.status).toBe(202);
    const retried = (await retryRes.json()) as AnalysisSummary;
    expect(retried.id).toBe(started.id);
    expect(retried.analysisVersion).toBe(started.analysisVersion);

    const second = await waitForTerminalAnalysis(started.id, tokenAdminA, orgAId);
    expect(second.status).toBe("FAILED");
  });

  it("refuses to cancel an analysis that already reached a terminal status (409)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const started = (await startRes.json()) as AnalysisSummary;
    await waitForTerminalAnalysis(started.id, tokenAdminA, orgAId);

    const cancelRes = await fetch(`${baseUrl}/api/v1/analyses/${started.id}/cancel`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(cancelRes.status).toBe(409);
    const body = (await cancelRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ANALYSIS_NOT_CANCELLABLE");
  });

  it("refuses a double trigger while a job is still active for the same document (409)", async () => {
    // Job QUEUED inséré directement (jamais dispatché, donc jamais traité) — garantit un test
    // déterministe, sans dépendre du minutage réel du dispatcher in-process. Utilise
    // `extractedDocumentId` (extraction déjà SUCCEEDED) pour que StartDocumentAnalysisUseCase
    // atteigne bien la garde "double déclenchement" plutôt que d'échouer plus tôt sur
    // DOCUMENT_EXTRACTION_NOT_FOUND. `analysisVersion: 2` évite toute collision avec la version 1
    // déjà créée par le premier test de ce fichier pour la même cible.
    await prisma.analysisJob.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        tenderId: tenderAId,
        dceId: (await prisma.dceDocument.findFirstOrThrow({ where: { documentId: extractedDocumentId } })).dceId,
        documentId: extractedDocumentId,
        targetId: extractedDocumentId,
        scope: "DOCUMENT",
        status: "QUEUED",
        analysisVersion: 2,
        promptVersion: 1,
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/documents/${extractedDocumentId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ANALYSIS_ALREADY_RUNNING");
  });

  it("propagates DOCUMENT_EXTRACTION_NOT_FOUND (404) when the document was never extracted", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/documents/${unextractedDocumentId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("DOCUMENT_EXTRACTION_NOT_FOUND");
  });

  it("rejects an unauthenticated request (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects a READ_ONLY actor trying to trigger an analysis (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenReadOnlyA, orgAId),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ANALYSIS_PERMISSION_MISSING");
  });

  // Correction réaudit Codex Sprint 4.1 (P1-01-R) — OWNER a bien `ROLE_ANALYSIS_PERMISSIONS`
  // depuis la première correction, mais StartTenderAnalysisUseCase/StartDocumentAnalysisUseCase
  // appellent aussi GetTenderUseCase (TenderPermission.Read) et, pour le scope DOCUMENT,
  // GetDocumentAnalysisInputUseCase (ExtractionPermission.Read) : les trois matrices doivent
  // désormais accorder OWNER pour que le chemin complet de déclenchement fonctionne réellement,
  // pas seulement la lecture/relance. Les tests ci-dessous prouvent le chemin complet, pas un
  // contournement.

  it("lets an OWNER trigger a TENDER-scope analysis via POST /tenders/:tenderId/analyses (202)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(startRes.status).toBe(202);
    const started = (await startRes.json()) as AnalysisSummary;
    expect(started.scope).toBe("TENDER");

    // Vidé jusqu'à un état terminal — jamais un job non terminal laissé en suspens pour
    // `tenderAId`, ce qui ferait échouer (409 ANALYSIS_ALREADY_RUNNING) un test ultérieur qui
    // déclenche une nouvelle analyse TENDER sur ce même Tender.
    await waitForTerminalAnalysis(started.id, tokenOwnerA, orgAId);
  });

  it("lets an OWNER trigger a DOCUMENT-scope analysis via POST /tenders/:tenderId/documents/:documentId/analyses (202)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/documents/${ownerExtractedDocumentId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(startRes.status).toBe(202);
    const started = (await startRes.json()) as AnalysisSummary;
    expect(started.scope).toBe("DOCUMENT");

    await waitForTerminalAnalysis(started.id, tokenOwnerA, orgAId);
  });

  it("lets an OWNER read (GET) and retry (POST .../retry) an analysis", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    const started = (await startRes.json()) as AnalysisSummary;

    const { status } = await getAnalysis(started.id, tokenOwnerA, orgAId);
    expect(status).toBe(200);

    await waitForTerminalAnalysis(started.id, tokenOwnerA, orgAId);
    const retryRes = await fetch(`${baseUrl}/api/v1/analyses/${started.id}/retry`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(retryRes.status).toBe(202);
    await waitForTerminalAnalysis(started.id, tokenOwnerA, orgAId);
  });

  it("lets an OWNER cancel a non-terminal analysis job (200)", async () => {
    // Job QUEUED inséré directement (jamais dispatché) — même technique déterministe que le test
    // "double trigger" ci-dessus, pour ne jamais dépendre du minutage réel du dispatcher
    // in-process : `unextractedDocumentId` n'a encore aucun AnalysisJob, aucune collision de
    // version possible.
    const jobId = randomUUID();
    await prisma.analysisJob.create({
      data: {
        id: jobId,
        organizationId: orgAId,
        tenderId: tenderAId,
        dceId: (await prisma.dceDocument.findFirstOrThrow({ where: { documentId: unextractedDocumentId } })).dceId,
        documentId: unextractedDocumentId,
        targetId: unextractedDocumentId,
        scope: "DOCUMENT",
        status: "QUEUED",
        analysisVersion: 1,
        promptVersion: 1,
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const cancelRes = await fetch(`${baseUrl}/api/v1/analyses/${jobId}/cancel`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    expect(cancelRes.status).toBe(200);
    const body = (await cancelRes.json()) as AnalysisSummary;
    expect(body.status).toBe("CANCELLED");
  });

  it("never lets an OWNER from another organization read an analysis (404, not 403)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenOwnerA, orgAId),
    });
    const started = (await startRes.json()) as AnalysisSummary;
    await waitForTerminalAnalysis(started.id, tokenOwnerA, orgAId);

    const { status, body } = await getAnalysis(started.id, tokenOwnerB, orgBId);
    expect(status).toBe(404);
    expect(body.error?.code).toBe("ANALYSIS_NOT_FOUND");
  });

  it("never leaks an analysis belonging to another organization (404, not 403)", async () => {
    const startRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/analyses`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const started = (await startRes.json()) as AnalysisSummary;

    const { status, body } = await getAnalysis(started.id, tokenAdminB, orgBId);
    expect(status).toBe(404);
    expect(body.error?.code).toBe("ANALYSIS_NOT_FOUND");
  });

  it("returns ANALYSIS_NOT_FOUND (404) for an unknown analysis id", async () => {
    const { status, body } = await getAnalysis(randomUUID(), tokenAdminA, orgAId);
    expect(status).toBe(404);
    expect(body.error?.code).toBe("ANALYSIS_NOT_FOUND");
  });
});
