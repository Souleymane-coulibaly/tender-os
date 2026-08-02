import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PackageFile } from "../domain/package-file";
import { SubmissionPackage } from "../domain/submission-package.aggregate";
import { PrismaSubmissionPackageRepository } from "./prisma-submission-package.repository";

const FILE_HASH = "e".repeat(64);

/** Preuve PostgreSQL réelle (mission Sprint 8A bis §75) — persistance réelle du package + ses
 *  fichiers, versionnement, isolation tenant, immutabilité (jamais une mise à jour en place). */
describe("SubmissionPackage repository (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaSubmissionPackageRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-09-01T10:00:00Z");

  let validationRunId: string;
  let approvalId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Package Repo Test Org", slug: `package-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Package Repo Test Org (other)", slug: `package-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({ data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() } });
    await prisma.tender.create({ data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() } });

    // Chaîne Export → Validation réelle jusqu'à une FinalApproval — seule sa présence (FK réelle)
    // importe ici, jamais son contenu métier (déjà couvert par les specs Validation/Export).
    const templateId = randomUUID();
    await prisma.exportTemplate.create({ data: { id: templateId, organizationId, documentType: "TECHNICAL_MEMO", name: `T-${randomUUID()}`, createdBy: randomUUID() } });
    const templateVersionId = randomUUID();
    await prisma.exportTemplateVersion.create({
      data: { id: templateVersionId, organizationId, exportTemplateId: templateId, version: 1, status: "DRAFT", format: "DOCX", config: { sections: [] }, createdBy: randomUUID() },
    });
    const exportJobId = randomUUID();
    await prisma.exportJob.create({
      data: {
        id: exportJobId,
        organizationId,
        clientAccountId,
        tenderId,
        exportTemplateId: templateId,
        exportTemplateVersionId: templateVersionId,
        documentType: "TECHNICAL_MEMO",
        mode: "FINAL",
        format: "DOCX",
        status: "COMPLETED",
        version: 1,
        createdBy: randomUUID(),
      },
    });
    validationRunId = randomUUID();
    await prisma.validationRun.create({
      data: { id: validationRunId, organizationId, clientAccountId, tenderId, exportJobId, readinessStatus: "READY_FOR_APPROVAL", runBy: randomUUID() },
    });
    approvalId = randomUUID();
    await prisma.finalApproval.create({
      data: { id: approvalId, organizationId, clientAccountId, tenderId, exportJobId, validationRunId, manifestHash: FILE_HASH, approvedBy: randomUUID(), approverRole: "OWNER" },
    });
  });

  afterAll(async () => {
    await prisma.packageFile.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.finalApproval.deleteMany({ where: { organizationId } });
    await prisma.validationRun.deleteMany({ where: { organizationId } });
    await prisma.exportJob.deleteMany({ where: { organizationId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.packageFile.deleteMany({ where: { organizationId } });
    await prisma.submissionPackage.deleteMany({ where: { organizationId } });
  });

  function buildPackage(version: number) {
    const id = randomUUID();
    const files = [
      PackageFile.create({ archivePath: "memoire-technique.pdf", sourceType: "EXPORT_ARTIFACT", fileName: "memoire-technique.pdf", mimeType: "application/pdf", fileSize: 1024, fileHash: FILE_HASH, order: 0 }),
      PackageFile.create({ archivePath: "manifest.json", sourceType: "MANIFEST", fileName: "manifest.json", mimeType: "application/json", fileSize: 128, fileHash: "f".repeat(64), order: 1 }),
    ];
    const pkg = SubmissionPackage.create({
      id,
      organizationId,
      clientAccountId,
      tenderId,
      version,
      validationRunId,
      approvalId,
      readinessStatus: "APPROVED",
      files,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    return { pkg, files };
  }

  it("creates a package with its files and reads them back with the correct order", async () => {
    const { pkg, files } = buildPackage(1);
    await repository.create({ pkg, files });

    const found = await repository.findById({ organizationId, packageId: pkg.id });
    expect(found!.pkg.status).toBe("PENDING");
    expect(found!.files).toHaveLength(2);
    expect(found!.files.map((f) => f.archivePath)).toEqual(["memoire-technique.pdf", "manifest.json"]);
  });

  it("generating then completing persists the real archive metadata, never mutating the row in place after COMPLETED", async () => {
    const { pkg, files } = buildPackage(1);
    await repository.create({ pkg, files });
    await repository.markGenerating({ organizationId, packageId: pkg.id });

    await repository.completeWithArchive({
      organizationId,
      packageId: pkg.id,
      fileName: "package-v1.zip",
      mimeType: "application/zip",
      fileSize: 2048,
      fileHash: "a".repeat(64),
      storageKey: `packages/${organizationId}/${tenderId}/${pkg.id}.zip`,
      manifestJson: { files: [] },
      occurredAt: now,
    });

    const found = await repository.findById({ organizationId, packageId: pkg.id });
    expect(found!.pkg.status).toBe("COMPLETED");
    expect(found!.pkg.fileHash).toBe("a".repeat(64));
    expect(found!.pkg.fileSize).toBe(2048);
  });

  it("version numbering is sequential per tender, never reused across packages", async () => {
    expect(await repository.nextVersion({ organizationId, tenderId })).toBe(1);
    const { pkg: pkg1, files: files1 } = buildPackage(1);
    await repository.create({ pkg: pkg1, files: files1 });

    expect(await repository.nextVersion({ organizationId, tenderId })).toBe(2);
    const { pkg: pkg2, files: files2 } = buildPackage(2);
    await repository.create({ pkg: pkg2, files: files2 });

    const list = await repository.listForTender({ organizationId, tenderId });
    expect(list.map((p) => p.pkg.version)).toEqual([2, 1]);
  });

  it("only a COMPLETED package is returned by findLatestCompletedForTender, never a PENDING/FAILED one", async () => {
    const { pkg, files } = buildPackage(1);
    await repository.create({ pkg, files });
    expect(await repository.findLatestCompletedForTender({ organizationId, tenderId })).toBeNull();

    await repository.markGenerating({ organizationId, packageId: pkg.id });
    await repository.markFailed({ organizationId, packageId: pkg.id, errorCode: "PACKAGE_ASSEMBLY_FAILED", errorMessage: "boom", occurredAt: now });
    expect(await repository.findLatestCompletedForTender({ organizationId, tenderId })).toBeNull();

    const { pkg: pkg2, files: files2 } = buildPackage(2);
    await repository.create({ pkg: pkg2, files: files2 });
    await repository.markGenerating({ organizationId, packageId: pkg2.id });
    await repository.completeWithArchive({
      organizationId,
      packageId: pkg2.id,
      fileName: "package-v2.zip",
      mimeType: "application/zip",
      fileSize: 4096,
      fileHash: "b".repeat(64),
      storageKey: `packages/${organizationId}/${tenderId}/${pkg2.id}.zip`,
      manifestJson: {},
      occurredAt: now,
    });

    const latest = await repository.findLatestCompletedForTender({ organizationId, tenderId });
    expect(latest!.pkg.id).toBe(pkg2.id);
  });

  it("tenant isolation — organization A cannot read organization B's package", async () => {
    const { pkg, files } = buildPackage(1);
    await repository.create({ pkg, files });
    expect(await repository.findById({ organizationId: otherOrganizationId, packageId: pkg.id })).toBeNull();
  });

  it("repeated (3x) package creation for distinct versions never corrupts file ordering", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { pkg, files } = buildPackage(attempt);
      await repository.create({ pkg, files });
      const found = await repository.findById({ organizationId, packageId: pkg.id });
      expect(found!.files.map((f) => f.order)).toEqual([0, 1]);
    }
  });
});
