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

    tenderAId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderAId,
        organizationId: orgAId,
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

    tenderBId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderBId,
        organizationId: orgBId,
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

  it("rejects a dangerous ZIP archive (path traversal) with 422", async () => {
    const dangerousZip = buildZipBuffer([{ name: "../../etc/passwd.pdf", content: Buffer.from("x") }]);
    const form = new FormData();
    form.append("archive", new Blob([dangerousZip], { type: "application/zip" }), "archive.zip");

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/import-zip`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
      body: form,
    });
    expect(res.status).toBe(422);
  });

  it("accepts a valid ZIP archive (201) with all entries imported", async () => {
    const zip = buildZipBuffer([
      { name: "cctp.pdf", content: Buffer.from("%PDF-1.7 entry a") },
      { name: "reglement.pdf", content: Buffer.from("%PDF-1.7 entry b") },
    ]);
    const form = new FormData();
    form.append("archive", new Blob([zip], { type: "application/zip" }), "archive.zip");

    const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderAId}/dce/import-zip`, {
      method: "POST",
      headers: authHeaders(tokenAdminA, orgAId),
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { accepted: unknown[] };
    expect(body.accepted).toHaveLength(2);
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
