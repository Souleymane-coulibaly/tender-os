import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { buildZipBuffer } from "../../test-support/zip-builder";
// Accès direct au repository Prisma de Memberships réservé à ce test : il n'existe aucune API
// publique pour créer la toute première Membership ADMIN d'une organisation sans passer par une
// Membership déjà active (OrganizationMembershipGuard l'exige) — même contournement déjà pratiqué
// par tenders-lots-http.integration.spec.ts.
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationRole } from "../../../memberships/domain/organization-role";

const PDF_BYTES = Buffer.from("%PDF-1.7 fake content for HTTP tests");

describe("DCE — real HTTP + PostgreSQL (NestJS)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const userIds: string[] = [];

  let tokenAdminA: string;
  let tokenReadOnlyA: string;
  let tokenAdminB: string;

  let tenderAId: string;
  let tenderA2Id: string;
  let archivedTenderId: string;
  let tenderBId: string;

  async function registerAndLogin(email: string): Promise<{ userId: string; token: string }> {
    const password = "SmokeTest#12345";
    const registerRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName: "DCE HTTP Test" }),
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

  async function importFile(input: {
    tenderId: string;
    token: string;
    organizationId: string;
    buffer: Buffer;
    filename: string;
  }): Promise<{ status: number; accepted: { documentId: string }[]; rejected: { reason: string }[] }> {
    const form = new FormData();
    form.append("files", new Blob([input.buffer], { type: "application/pdf" }), input.filename);
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    const body = (await res.json()) as { accepted: { documentId: string }[]; rejected: { reason: string }[] };
    return { status: res.status, ...body };
  }

  type DceImportJobResponse = {
    id: string;
    status: string;
    result?: { accepted: { documentId: string }[]; rejected: { originalFilename: string; reason: string }[] };
    errorMessage?: string;
  };

  /** Mission Sprint 8A.2 (correction bug #3) — l'import ZIP est désormais asynchrone : la requête
   *  HTTP ne renvoie plus qu'un `jobId` (202), jamais le résultat final directement. */
  async function startZipImport(input: {
    tenderId: string;
    token: string;
    organizationId: string;
    zip: Buffer;
    filename?: string;
  }): Promise<{ status: number; job: DceImportJobResponse }> {
    const form = new FormData();
    form.append("archive", new Blob([input.zip], { type: "application/zip" }), input.filename ?? "archive.zip");
    const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/import-zip`, {
      method: "POST",
      headers: authHeaders(input.token, input.organizationId),
      body: form,
    });
    const job = (await res.json()) as DceImportJobResponse;
    return { status: res.status, job };
  }

  const TERMINAL_IMPORT_JOB_STATUSES = new Set(["READY", "PARTIALLY_READY", "FAILED", "CANCELLED"]);

  async function waitForTerminalImportJob(input: {
    tenderId: string;
    jobId: string;
    token: string;
    organizationId: string;
    timeoutMs?: number;
  }): Promise<DceImportJobResponse> {
    const deadline = Date.now() + (input.timeoutMs ?? 15000);
    for (;;) {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${input.tenderId}/dce/import-jobs/${input.jobId}`, {
        headers: authHeaders(input.token, input.organizationId),
      });
      const job = (await res.json()) as DceImportJobResponse;
      if (res.status === 200 && TERMINAL_IMPORT_JOB_STATUSES.has(job.status)) {
        return job;
      }
      if (Date.now() > deadline) {
        throw new Error(`Import job ${input.jobId} never reached a terminal status (last: ${job.status})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
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
      data: {
        id: orgAId,
        name: "DCE Org A HTTP",
        slug: `dce-org-a-http-${orgAId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    await prisma.organization.create({
      data: {
        id: orgBId,
        name: "DCE Org B HTTP",
        slug: `dce-org-b-http-${orgBId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const adminA = await registerAndLogin(`dce-admin-a-${randomUUID()}@smoke.test`);
    const readOnlyA = await registerAndLogin(`dce-readonly-a-${randomUUID()}@smoke.test`);
    const adminB = await registerAndLogin(`dce-admin-b-${randomUUID()}@smoke.test`);
    userIds.push(adminA.userId, readOnlyA.userId, adminB.userId);
    tokenAdminA = adminA.token;
    tokenReadOnlyA = readOnlyA.token;
    tokenAdminB = adminB.token;

    await addMembership({ organizationId: orgAId, userId: adminA.userId, role: OrganizationRole.OrganizationAdmin });
    await addMembership({ organizationId: orgAId, userId: readOnlyA.userId, role: OrganizationRole.ReadOnly });
    await addMembership({ organizationId: orgBId, userId: adminB.userId, role: OrganizationRole.OrganizationAdmin });

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
      data: {
        id: tenderAId,
        organizationId: orgAId,
        clientAccountId: clientAccountA.id,
        title: "Tender A — DCE HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: adminA.userId,
      },
    });

    archivedTenderId = randomUUID();
    await prisma.tender.create({
      data: {
        id: archivedTenderId,
        organizationId: orgAId,
        clientAccountId: clientAccountA.id,
        title: "Tender archive — DCE HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: adminA.userId,
      },
    });
    const archiveRes = await fetch(`${baseUrl}/api/v1/tenders/${archivedTenderId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenAdminA, orgAId) },
    });
    expect(archiveRes.status).toBe(200);

    tenderA2Id = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderA2Id,
        organizationId: orgAId,
        clientAccountId: clientAccountA.id,
        title: "Tender A2 — DCE HTTP (concurrency/idempotence)",
        status: "DRAFT",
        tags: [],
        createdBy: adminA.userId,
      },
    });

    tenderBId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderBId,
        organizationId: orgBId,
        clientAccountId: clientAccountB.id,
        title: "Tender B — DCE HTTP",
        status: "DRAFT",
        tags: [],
        createdBy: adminB.userId,
      },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.dceDocument.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.dce.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: [orgAId, orgBId] } } });
    await prisma.document.updateMany({
      where: { organizationId: { in: [orgAId, orgBId] } },
      data: { currentVersionId: null },
    });
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

  it("creates the DCE of Tender A (idempotent)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenAdminA, orgAId) },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; tenderId: string };
    expect(body.status).toBe("DRAFT");
    expect(body.tenderId).toBe(tenderAId);

    const second = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenAdminA, orgAId) },
    });
    expect(second.status).toBe(201);
  });

  it("READ_ONLY cannot import a file (403)", async () => {
    const form = new FormData();
    form.append("files", new Blob([PDF_BYTES], { type: "application/pdf" }), "cctp.pdf");

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(tokenReadOnlyA, orgAId),
      body: form,
    });
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported file format per-file, inside a 201 partial-success response", async () => {
    const form = new FormData();
    form.append("files", new Blob([Buffer.from("MZ fake exe")], { type: "application/x-msdownload" }), "virus.exe");

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: unknown[]; rejected: { originalFilename: string }[] };
    expect(body.accepted).toHaveLength(0);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0]?.originalFilename).toBe("virus.exe");
  });

  it("accepts a valid PDF import (201) and it becomes listable/downloadable", async () => {
    const form = new FormData();
    form.append("files", new Blob([PDF_BYTES], { type: "application/pdf" }), "cctp.pdf");

    const importRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
      body: form,
    });
    expect(importRes.status).toBe(201);
    const importBody = (await importRes.json()) as { accepted: { documentId: string }[] };
    expect(importBody.accepted).toHaveLength(1);
    const documentId = importBody.accepted[0]!.documentId;

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { documentId: string }[];
    expect(listed.some((item) => item.documentId === documentId)).toBe(true);

    const downloadRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents/${documentId}/download`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get("content-type")).toBe("application/pdf");
  });

  /** Mission Sprint 8A.2 (correction bug #3 "import ZIP lourd échoue ou bloque") — l'import ZIP
   *  est désormais asynchrone : la requête HTTP répond IMMÉDIATEMENT avec un job à l'état CREATED
   *  (202), jamais un 422/201 synchrone qui obligerait à attendre l'extraction/l'import complets.
   *  Une archive dangereuse échoue le JOB (FAILED), jamais la requête elle-même. */
  it("a dangerous ZIP archive (path traversal) responds 202 immediately, then ends the job as FAILED", async () => {
    const dangerousZip = buildZipBuffer([{ name: "../../etc/passwd.pdf", content: Buffer.from("x") }]);

    const { status, job: created } = await startZipImport({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, zip: dangerousZip });
    expect(status).toBe(202);
    expect(created.status).toBe("CREATED");

    const job = await waitForTerminalImportJob({ tenderId: tenderAId, jobId: created.id, token: tokenAdminA, organizationId: orgAId });
    expect(job.status).toBe("FAILED");
    expect(job.errorMessage).toMatch(/ZIP archive rejected/);
  });

  it("responds 202 immediately for a valid ZIP archive, and the job reaches READY with all entries imported", async () => {
    const zip = buildZipBuffer([
      { name: "cctp.pdf", content: Buffer.from("%PDF-1.7 entry a") },
      { name: "reglement.pdf", content: Buffer.from("%PDF-1.7 entry b") },
    ]);

    const { status, job: created } = await startZipImport({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, zip });
    expect(status).toBe(202);
    expect(created.status).toBe("CREATED");
    expect(created.result).toBeUndefined();

    const job = await waitForTerminalImportJob({ tenderId: tenderAId, jobId: created.id, token: tokenAdminA, organizationId: orgAId });
    expect(job.status).toBe("READY");
    expect(job.result?.accepted).toHaveLength(2);
  });

  it("READ_ONLY (no client assignment, same fixture as the rest of this file) cannot start an import (403) nor poll one belonging to a tender it has no client access to (404, never 500)", async () => {
    const zip = buildZipBuffer([{ name: "readonly-guard.pdf", content: Buffer.from("%PDF-1.7 readonly guard") }]);
    const forbidden = await startZipImport({ tenderId: tenderAId, token: tokenReadOnlyA, organizationId: orgAId, zip });
    expect(forbidden.status).toBe(403);

    const { job: created } = await startZipImport({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, zip });
    // Correctif Sprint 8A.2 (DceErrorFilter était le seul filtre du projet à ne mapper ni
    // CLIENT_ACCOUNT_NOT_FOUND ni CLIENT_PERMISSION_MISSING — voir dce-error.filter.ts) : ce
    // chemin de lecture doit rester un 404 explicite (anti-énumération, même motif que partout
    // ailleurs), jamais un 500 opaque qui masquerait la vraie cause.
    const pollRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/import-jobs/${created.id}`, {
      headers: authHeaders(tokenReadOnlyA, orgAId),
    });
    expect(pollRes.status).toBe(404);
  });

  it("never lets org B poll org A's import job (404)", async () => {
    const zip = buildZipBuffer([{ name: "isolation-guard.pdf", content: Buffer.from("%PDF-1.7 isolation guard") }]);
    const { job: created } = await startZipImport({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, zip });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/import-jobs/${created.id}`, {
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(res.status).toBe(404);
  });

  it("mission P1-2 — two concurrent imports of the exact same file content into the same DCE create only one active document", async () => {
    await ensureDce(tenderA2Id, tokenAdminA, orgAId);
    const identicalContent = Buffer.from(`%PDF-1.7 concurrency-idempotence-${randomUUID()}`);

    const [first, second] = await Promise.all([
      importFile({ tenderId: tenderA2Id, token: tokenAdminA, organizationId: orgAId, buffer: identicalContent, filename: "cctp-a.pdf" }),
      importFile({ tenderId: tenderA2Id, token: tokenAdminA, organizationId: orgAId, buffer: identicalContent, filename: "cctp-b.pdf" }),
    ]);

    const accepted = [...first.accepted, ...second.accepted];
    const rejected = [...first.rejected, ...second.rejected];
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatch(/duplicate/);

    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderA2Id}/dce/documents`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const listed = (await listRes.json()) as unknown[];
    expect(listed).toHaveLength(1);
  });

  it("mission P1-2 — a retried import (sequential, simulating a client retry after a timeout) does not duplicate", async () => {
    const content = Buffer.from(`%PDF-1.7 retry-${randomUUID()}`);

    const firstAttempt = await importFile({
      tenderId: tenderA2Id,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: content,
      filename: "retry-1.pdf",
    });
    expect(firstAttempt.accepted).toHaveLength(1);

    const retriedAttempt = await importFile({
      tenderId: tenderA2Id,
      token: tokenAdminA,
      organizationId: orgAId,
      buffer: content,
      filename: "retry-2.pdf",
    });
    expect(retriedAttempt.accepted).toHaveLength(0);
    expect(retriedAttempt.rejected[0]?.reason).toMatch(/duplicate/);
  });

  it("mission P1-2 — the same ZIP replayed does not create duplicate active documents", async () => {
    const zip = buildZipBuffer([{ name: `replayed-${randomUUID()}.pdf`, content: Buffer.from("%PDF-1.7 replayed entry") }]);

    const { status: firstStatus, job: firstCreated } = await startZipImport({
      tenderId: tenderA2Id,
      token: tokenAdminA,
      organizationId: orgAId,
      zip,
    });
    expect(firstStatus).toBe(202);
    const firstJob = await waitForTerminalImportJob({ tenderId: tenderA2Id, jobId: firstCreated.id, token: tokenAdminA, organizationId: orgAId });
    expect(firstJob.status).toBe("READY");
    expect(firstJob.result?.accepted).toHaveLength(1);

    const { status: replayedStatus, job: replayedCreated } = await startZipImport({
      tenderId: tenderA2Id,
      token: tokenAdminA,
      organizationId: orgAId,
      zip,
    });
    expect(replayedStatus).toBe(202);
    const replayedJob = await waitForTerminalImportJob({
      tenderId: tenderA2Id,
      jobId: replayedCreated.id,
      token: tokenAdminA,
      organizationId: orgAId,
    });
    expect(replayedJob.status).toBe("PARTIALLY_READY");
    expect(replayedJob.result?.accepted).toHaveLength(0);
    expect(replayedJob.result?.rejected[0]?.reason).toMatch(/duplicate/);
  });

  it("mission P1-2 — two different organizations can import byte-identical content without collision", async () => {
    await ensureDce(tenderBId, tokenAdminB, orgBId);
    const identicalContent = Buffer.from(`%PDF-1.7 cross-org-${randomUUID()}`);

    const [orgAResult, orgBResult] = await Promise.all([
      importFile({ tenderId: tenderA2Id, token: tokenAdminA, organizationId: orgAId, buffer: identicalContent, filename: "shared.pdf" }),
      importFile({ tenderId: tenderBId, token: tokenAdminB, organizationId: orgBId, buffer: identicalContent, filename: "shared.pdf" }),
    ]);

    expect(orgAResult.accepted).toHaveLength(1);
    expect(orgBResult.accepted).toHaveLength(1);
  });

  it("mission P1-2 — two different DCEs of the same organization can import byte-identical content without collision", async () => {
    const identicalContent = Buffer.from(`%PDF-1.7 cross-dce-${randomUUID()}`);

    const [tenderAResult, tenderA2Result] = await Promise.all([
      importFile({ tenderId: tenderAId, token: tokenAdminA, organizationId: orgAId, buffer: identicalContent, filename: "shared-2.pdf" }),
      importFile({ tenderId: tenderA2Id, token: tokenAdminA, organizationId: orgAId, buffer: identicalContent, filename: "shared-2.pdf" }),
    ]);

    expect(tenderAResult.accepted).toHaveLength(1);
    expect(tenderA2Result.accepted).toHaveLength(1);
  });

  it("refuses to mutate the DCE of an archived tender (409)", async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/tenders/${archivedTenderId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenAdminA, orgAId) },
    });
    expect(createRes.status).toBe(409);
  });

  it("org B cannot read org A's DCE (404)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, {
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(res.status).toBe(404);
  });

  it("org B cannot list org A's DCE documents (404)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(res.status).toBe(404);
  });

  it("org B cannot download org A's DCE document (404)", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const [firstDocument] = (await listRes.json()) as { documentId: string }[];

    const res = await fetch(
      `${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents/${firstDocument!.documentId}/download`,
      { headers: authHeaders(tokenAdminB, orgBId) },
    );
    expect(res.status).toBe(404);
  });

  it("org B cannot delete org A's DCE document (404)", async () => {
    const listRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    const [firstDocument] = (await listRes.json()) as { documentId: string }[];

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/documents/${firstDocument!.documentId}`, {
      method: "DELETE",
      headers: authHeaders(tokenAdminB, orgBId),
    });
    expect(res.status).toBe(404);
  });

  it("org B cannot create a DCE by injecting org A's tenderId while authenticated as org B (404)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(tokenAdminB, orgBId) },
    });
    expect(res.status).toBe(404);
  });

  it("the original DCE of tender A is untouched after every cross-tenant attempt", async () => {
    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce`, {
      headers: authHeaders(tokenAdminA, orgAId),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenderId: string };
    expect(body.tenderId).toBe(tenderAId);
  });
});
