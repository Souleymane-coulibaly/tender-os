import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../../../app.module";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { computeSha256 } from "../../../../shared-kernel/file-hash";
import { STORAGE_PROVIDER, type StorageProvider } from "../../../documents";
import { MembershipId } from "../../../memberships/domain/membership-id.value-object";
import { OrganizationMembership } from "../../../memberships/domain/organization-membership.aggregate";
import { OrganizationRole } from "../../../memberships/domain/organization-role";
import { PrismaMembershipRepository } from "../../../memberships/infrastructure/prisma-membership.repository";

const EXPORT_ARTIFACT_CONTENT = Buffer.from("%PDF-1.4 mémoire technique approuvée (fixture de test)");
const FILE_HASH = computeSha256(EXPORT_ARTIFACT_CONTENT);

/**
 * Preuve réelle HTTP + PostgreSQL du module SubmissionPackage (Sprint 8A bis) — dernier maillon de
 * la chaîne Export ← {Validation, Signature} ← Package : n'expose AUCUNE route pour produire les
 * étapes en amont (hors périmètre HTTP de ce module), donc l'approbation active et l'artefact FINAL
 * sont semés directement via Prisma, comme pour les autres tests HTTP de ce sprint.
 */
describe("SubmissionPackage — real HTTP + PostgreSQL (NestJS)", () => {
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
      body: JSON.stringify({ email, password, displayName: "Package HTTP Test" }),
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

  /** Sème un Tender avec la chaîne Export FINAL/COMPLETED complète jusqu'à une FinalApproval
   *  ACTIVE — le seul chemin réel pour rendre un Tender "packageable" hors périmètre HTTP. */
  async function seedApprovedTender(ownerId: string): Promise<{ tenderId: string }> {
    const tenderId = randomUUID();
    await prisma.tender.create({ data: { id: tenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché HTTP Package", status: "DRAFT", tags: [], createdBy: ownerId } });

    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId: orgAId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: ownerId } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId: orgAId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "PDF", config: { sections: [] }, createdBy: ownerId },
    });
    const exportJobId = randomUUID();
    const storageKey = `exports/${orgAId}/${tenderId}/${exportJobId}.pdf`;
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId: orgAId,
        clientAccountId: clientAId,
        tenderId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "TECHNICAL_MEMO",
        mode: "FINAL",
        format: "PDF",
        status: "COMPLETED",
        version: 1,
        createdBy: ownerId,
      },
    });
    await prisma.exportArtifact.create({
      data: {
        id: randomUUID(),
        organizationId: orgAId,
        exportJobId,
        fileName: "memoire-technique.pdf",
        mimeType: "application/pdf",
        fileSize: EXPORT_ARTIFACT_CONTENT.length,
        fileHash: FILE_HASH,
        storageKey,
        manifestJson: {},
      },
    });
    const storageProvider = app.get<StorageProvider>(STORAGE_PROVIDER);
    await storageProvider.put({ key: storageKey, content: Readable.from(EXPORT_ARTIFACT_CONTENT), contentType: "application/pdf", sizeBytes: EXPORT_ARTIFACT_CONTENT.length });

    const validationRunId = randomUUID();
    await prisma.validationRun.create({ data: { id: validationRunId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: ownerId } });

    const approvalId = randomUUID();
    await prisma.finalApproval.create({
      data: { id: approvalId, organizationId: orgAId, clientAccountId: clientAId, tenderId, exportJobId, validationRunId, manifestHash: FILE_HASH, approvedBy: ownerId, approverRole: "OWNER" },
    });

    return { tenderId };
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
        { id: orgAId, name: "Package Org A HTTP", slug: `package-org-a-http-${orgAId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: orgBId, name: "Package Org B HTTP", slug: `package-org-b-http-${orgBId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });

    const ownerA = await registerAndLogin(`package-owner-a-${randomUUID()}@smoke.test`);
    const ownerB = await registerAndLogin(`package-owner-b-${randomUUID()}@smoke.test`);
    userIds.push(ownerA.userId, ownerB.userId);
    ownerAUserId = ownerA.userId;
    tokenOwnerA = ownerA.token;
    tokenOwnerB = ownerB.token;

    await addMembership({ organizationId: orgAId, userId: ownerA.userId, role: OrganizationRole.Owner });
    await addMembership({ organizationId: orgBId, userId: ownerB.userId, role: OrganizationRole.Owner });

    await prisma.clientAccount.create({ data: { id: clientAId, organizationId: orgAId, name: "Client A", nameNormalized: "client a", status: "ACTIVE", createdBy: ownerA.userId } });
  }, 60000);

  afterAll(async () => {
    await prisma.packageFile.deleteMany({ where: { organizationId: orgAId } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId: orgAId } });
    await prisma.finalApproval.deleteMany({ where: { organizationId: orgAId } });
    await prisma.validationRun.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportArtifact.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportJob.deleteMany({ where: { organizationId: orgAId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: orgAId } });
    // Sprint 8C Phase 2 — les pièces administratives uploadées via /documents ont leur propre FK
    // directe vers organization_id (pas seulement via tender, qui cascade déjà les tables
    // administrative_*), donc jamais laissées derrière avant la suppression de l'organisation.
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
    const res = await fetch(`${baseUrl}/api/v1/tenders/${randomUUID()}/packages`);
    expect(res.status).toBe(401);
  });

  it("refuses packaging a tender with no active final approval (422 PACKAGE_NOT_READY)", async () => {
    const bareTenderId = randomUUID();
    await prisma.tender.create({ data: { id: bareTenderId, organizationId: orgAId, clientAccountId: clientAId, title: "Marché sans approbation", status: "DRAFT", tags: [], createdBy: ownerAUserId } });

    const res = await fetch(`${baseUrl}/api/v1/tenders/${bareTenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PACKAGE_NOT_READY");
  });

  describe("full lifecycle on an approved tender (no signature required)", () => {
    let tenderId: string;
    let packageId: string;

    beforeAll(async () => {
      const seeded = await seedApprovedTender(ownerAUserId);
      tenderId = seeded.tenderId;
    });

    it("OWNER creates a package (201, COMPLETED, readiness APPROVED since no mandatory signature was confirmed)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { id: string; status: string; readinessStatus: string; version: number; files: readonly { archivePath: string }[] };
      packageId = body.id;
      expect(body.status).toBe("COMPLETED");
      expect(body.readinessStatus).toBe("APPROVED");
      expect(body.version).toBe(1);
      expect(body.files.map((f) => f.archivePath).sort()).toEqual(["manifest.json", "memoire-technique.pdf"]);
    });

    it("never lets org B read org A's package (404)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerB, orgBId) });
      expect(res.status).toBe(404);
    });

    it("OWNER reads their own package (200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(packageId);
    });

    it("GET tender packages lists it", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as readonly { id: string }[];
      expect(body.map((p) => p.id)).toContain(packageId);
    });

    it("downloads a REAL ZIP containing the export artifact and a manifest.json with matching hashes", async () => {
      const res = await fetch(`${baseUrl}/api/v1/packages/${packageId}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/zip");

      const arrayBuffer = await res.arrayBuffer();
      const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
      expect(Object.keys(zip.files).sort()).toEqual(["manifest.json", "memoire-technique.pdf"]);

      const extractedPdf = await zip.file("memoire-technique.pdf")!.async("nodebuffer");
      expect(extractedPdf.equals(EXPORT_ARTIFACT_CONTENT)).toBe(true);

      const manifestText = await zip.file("manifest.json")!.async("string");
      const manifest = JSON.parse(manifestText) as { packageId: string; files: readonly { archivePath: string; fileHash: string }[] };
      expect(manifest.packageId).toBe(packageId);
      const pdfEntry = manifest.files.find((f) => f.archivePath === "memoire-technique.pdf");
      expect(pdfEntry!.fileHash).toBe(FILE_HASH);
    });

    it("creating a second package for the same tender produces version 2, never overwriting version 1", async () => {
      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { version: number };
      expect(body.version).toBe(2);

      const stillThere = await fetch(`${baseUrl}/api/v1/packages/${packageId}`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(stillThere.status).toBe(200);
    });
  });

  describe("Sprint 8C Phase 2 — validated administrative documents are included as package sources", () => {
    async function uploadDocument(filename: string): Promise<string> {
      const form = new FormData();
      form.append("title", filename);
      form.append("origin", "USER_UPLOAD");
      form.append("domain", "TENDER");
      form.append("file", new Blob([`content-${filename}`], { type: "application/pdf" }), filename);
      const res = await fetch(`${baseUrl}/api/v1/documents`, { method: "POST", headers: { Authorization: `Bearer ${tokenOwnerA}`, "X-Organization-Id": orgAId }, body: form });
      expect(res.status).toBe(201);
      const document = (await res.json()) as { id: string };
      return document.id;
    }

    it("a validated administrative document appears in the ZIP under administratif/ and in the manifest as ADMINISTRATIVE_DOCUMENT", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);

      const ensureDossierRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-dossier`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(ensureDossierRes.status).toBe(200);

      const createDocRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/administrative-documents`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentType: "RIB", label: "RIB" }),
      });
      expect(createDocRes.status).toBe(201);
      const administrativeDocument = (await createDocRes.json()) as { id: string; revisions: readonly { id: string }[] };

      const uploadedDocumentId = await uploadDocument("rib-package.pdf");
      const attachRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/revisions`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ documentId: uploadedDocumentId }),
      });
      expect(attachRes.status).toBe(201);
      const attached = (await attachRes.json()) as { revisions: readonly { id: string }[] };
      const revisionId = attached.revisions[0]!.id;

      const validateRes = await fetch(`${baseUrl}/api/v1/administrative-documents/${administrativeDocument.id}/validate`, {
        method: "POST",
        headers: authHeaders(tokenOwnerA, orgAId),
        body: JSON.stringify({ revisionId }),
      });
      expect(validateRes.status).toBe(200);

      const createPackageRes = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(createPackageRes.status).toBe(201);
      const pkg = (await createPackageRes.json()) as { id: string; files: readonly { archivePath: string; sourceType: string }[] };
      const adminEntry = pkg.files.find((f) => f.sourceType === "ADMINISTRATIVE_DOCUMENT");
      expect(adminEntry?.archivePath).toContain("administratif/");
      expect(adminEntry?.archivePath).toContain(administrativeDocument.id);

      const downloadRes = await fetch(`${baseUrl}/api/v1/packages/${pkg.id}/download`, { headers: authHeaders(tokenOwnerA, orgAId) });
      expect(downloadRes.status).toBe(200);
      const zip = await JSZip.loadAsync(Buffer.from(await downloadRes.arrayBuffer()));
      const zipPaths = Object.keys(zip.files);
      expect(zipPaths.some((p) => p.startsWith("administratif/") && p.includes(administrativeDocument.id))).toBe(true);

      const manifestText = await zip.file("manifest.json")!.async("string");
      const manifest = JSON.parse(manifestText) as { files: readonly { sourceType: string; sourceId?: string }[] };
      expect(manifest.files.some((f) => f.sourceType === "ADMINISTRATIVE_DOCUMENT" && f.sourceId === administrativeDocument.id)).toBe(true);
    });
  });

  describe("signature gate", () => {
    it("blocks packaging while a MANDATORY signature requirement is CONFIRMED but no transaction is VERIFIED yet (422)", async () => {
      const { tenderId } = await seedApprovedTender(ownerAUserId);
      await prisma.signatureRequirement.create({
        data: { id: randomUUID(), organizationId: orgAId, clientAccountId: clientAId, tenderId, documentRef: "Acte d'engagement", mandatory: true, status: "CONFIRMED", createdBy: ownerAUserId },
      });

      const res = await fetch(`${baseUrl}/api/v1/tenders/${tenderId}/packages`, { method: "POST", headers: authHeaders(tokenOwnerA, orgAId) });
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("PACKAGE_NOT_READY");
    });
  });
});
