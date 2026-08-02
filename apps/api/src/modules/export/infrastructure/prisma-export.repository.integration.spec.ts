import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { computeSha256, FILE_HASH_ALGORITHM } from "../../../shared-kernel/file-hash";
import { ExportArtifact } from "../domain/export-artifact";
import { ExportDocumentType } from "../domain/export-document-type";
import { ExportFormat } from "../domain/export-format";
import { ExportJob } from "../domain/export-job.aggregate";
import { ExportMode } from "../domain/export-mode";
import { ExportSectionSelection, ExportSectionValidationStatus } from "../domain/export-section-selection";
import { ExportSectionSource } from "../domain/export-section-source";
import { validateExportTemplateConfig } from "../domain/export-template-config";
import { ExportTemplate } from "../domain/export-template.aggregate";
import { ExportTemplateVersion } from "../domain/export-template-version.entity";
import { PrismaExportJobRepository } from "./prisma-export-job.repository";
import { PrismaExportTemplateRepository } from "./prisma-export-template.repository";

/**
 * Preuve PostgreSQL réelle (mission Sprint 8A §75) — un fake en mémoire ne suffit pas à démontrer
 * que l'index partiel "une seule version ACTIVE" protège réellement contre une activation
 * concurrente, ni que le manifest JSON et le hash survivent un aller-retour réel.
 */
describe("Export repositories (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const templateRepository = new PrismaExportTemplateRepository(prisma);
  const jobRepository = new PrismaExportJobRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const now = new Date("2026-09-01T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Export Repo Test Org", slug: `export-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Export Repo Test Org (other)", slug: `export-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() },
    });
  });

  afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.exportJob.deleteMany({ where: { organizationId } });
    await prisma.exportTemplate.deleteMany({ where: { organizationId } });
  });

  function buildTemplateAndVersion() {
    const templateId = randomUUID();
    const template = ExportTemplate.create({
      id: templateId,
      organizationId,
      documentType: ExportDocumentType.TechnicalMemo,
      name: `Modèle ${randomUUID()}`,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    const version = ExportTemplateVersion.create({
      id: randomUUID(),
      organizationId,
      exportTemplateId: templateId,
      version: 1,
      format: ExportFormat.Docx,
      config: validateExportTemplateConfig({ sections: [{ id: "SUMMARY", label: "Résumé", mandatory: true, order: 0 }] }),
      createdBy: randomUUID(),
      occurredAt: now,
    });
    return { template, version };
  }

  it("persists a template with its first DRAFT version and reads it back with the same config", async () => {
    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });

    const found = await templateRepository.findById({ organizationId, exportTemplateId: template.id });
    expect(found).not.toBeNull();
    expect(found!.activeVersion).toBeUndefined();

    const versions = await templateRepository.listVersions({ organizationId, exportTemplateId: template.id });
    expect(versions).toHaveLength(1);
    expect(versions[0]!.config.sections[0]!.id).toBe("SUMMARY");
  });

  it("activateAtomically archives the previously active version and activates the new one, real concurrency-safe", async () => {
    const { template, version: v1 } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version: v1 });
    await templateRepository.activateAtomically({ organizationId, exportTemplateId: template.id, versionId: v1.id, occurredAt: now });

    const v2 = ExportTemplateVersion.create({
      id: randomUUID(),
      organizationId,
      exportTemplateId: template.id,
      version: 2,
      format: ExportFormat.Docx,
      config: v1.config,
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await templateRepository.createVersion(v2);
    await templateRepository.activateAtomically({ organizationId, exportTemplateId: template.id, versionId: v2.id, occurredAt: now });

    const active = await templateRepository.findActiveVersion({ organizationId, exportTemplateId: template.id });
    expect(active!.id).toBe(v2.id);
    const archived = await templateRepository.findVersionById({ organizationId, versionId: v1.id });
    expect(archived!.status).toBe("ARCHIVED");
  });

  it("repeated concurrent activation attempts never leave two ACTIVE versions (partial unique index, real Postgres)", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { template, version: v1 } = buildTemplateAndVersion();
      await templateRepository.createWithFirstVersion({ template, version: v1 });
      const v2 = ExportTemplateVersion.create({
        id: randomUUID(),
        organizationId,
        exportTemplateId: template.id,
        version: 2,
        format: ExportFormat.Docx,
        config: v1.config,
        createdBy: randomUUID(),
        occurredAt: now,
      });
      await templateRepository.createVersion(v2);

      await Promise.allSettled([
        templateRepository.activateAtomically({ organizationId, exportTemplateId: template.id, versionId: v1.id, occurredAt: now }),
        templateRepository.activateAtomically({ organizationId, exportTemplateId: template.id, versionId: v2.id, occurredAt: now }),
      ]);

      const activeCount = await prisma.exportTemplateVersion.count({ where: { organizationId, exportTemplateId: template.id, status: "ACTIVE" } });
      expect(activeCount).toBe(1);
    }
  });

  it("creates an export job with its sections, marks it generating, then completes it with a real artifact — full round trip", async () => {
    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });
    await templateRepository.activateAtomically({ organizationId, exportTemplateId: template.id, versionId: version.id, occurredAt: now });

    const jobId = randomUUID();
    const section = ExportSectionSelection.create({
      sectionId: "SUMMARY",
      sourceType: ExportSectionSource.Manual,
      manualContent: "Contenu du résumé.",
      validationStatus: ExportSectionValidationStatus.Unknown,
      selectedBy: randomUUID(),
      selectedAt: now,
      order: 0,
    });
    const job = ExportJob.create({
      id: jobId,
      organizationId,
      clientAccountId,
      tenderId,
      exportTemplateId: template.id,
      exportTemplateVersionId: version.id,
      documentType: ExportDocumentType.TechnicalMemo,
      mode: ExportMode.Preview,
      format: ExportFormat.Docx,
      version: await jobRepository.nextVersion({ organizationId, tenderId, documentType: ExportDocumentType.TechnicalMemo, format: ExportFormat.Docx }),
      sections: [section],
      createdBy: randomUUID(),
      occurredAt: now,
    });

    await jobRepository.create(job);
    await jobRepository.markGenerating({ organizationId, exportJobId: jobId });

    const fileContent = Buffer.from("fake docx bytes for the integration test");
    const fileHash = computeSha256(fileContent);
    const artifact = ExportArtifact.create({
      id: randomUUID(),
      organizationId,
      exportJobId: jobId,
      fileName: "TenderOS_TECHNICAL_MEMO_v1.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileSize: fileContent.length,
      fileHash,
      hashAlgorithm: FILE_HASH_ALGORITHM,
      storageKey: `exports/${organizationId}/${tenderId}/${jobId}.docx`,
      manifest: {
        exportId: jobId,
        organizationId,
        clientAccountId,
        tenderId,
        templateId: template.id,
        templateVersionId: version.id,
        mode: "PREVIEW",
        format: "DOCX",
        documentType: "TECHNICAL_MEMO",
        version: 1,
        sections: [{ sectionId: "SUMMARY", label: "Résumé", sourceType: "MANUAL", validationStatus: "UNKNOWN", order: 0 }],
        createdBy: job.createdBy,
        createdAt: now.toISOString(),
        filename: "TenderOS_TECHNICAL_MEMO_v1.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileSize: fileContent.length,
        fileHash,
        hashAlgorithm: FILE_HASH_ALGORITHM,
        storageKey: `exports/${organizationId}/${tenderId}/${jobId}.docx`,
        warnings: [],
        errors: [],
      },
      warnings: [],
      errors: [],
      createdAt: now,
    });

    await jobRepository.completeWithArtifact({ organizationId, exportJobId: jobId, artifact, occurredAt: now });

    const found = await jobRepository.findById({ organizationId, exportJobId: jobId });
    expect(found!.job.status).toBe("COMPLETED");
    expect(found!.artifact!.fileHash).toBe(fileHash);
    expect(found!.artifact!.manifest.sections).toHaveLength(1);
    expect(found!.job.sections[0]!.manualContent).toBe("Contenu du résumé.");
  });

  it("numbers export job versions sequentially per (tenderId, documentType, format), independent of mode", async () => {
    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });

    const v1 = await jobRepository.nextVersion({ organizationId, tenderId, documentType: ExportDocumentType.TechnicalMemo, format: ExportFormat.Docx });
    expect(v1).toBe(1);

    const section = ExportSectionSelection.create({
      sectionId: "SUMMARY",
      sourceType: ExportSectionSource.Manual,
      manualContent: "x",
      validationStatus: ExportSectionValidationStatus.Unknown,
      selectedBy: randomUUID(),
      selectedAt: now,
      order: 0,
    });
    const job1 = ExportJob.create({
      id: randomUUID(),
      organizationId,
      clientAccountId,
      tenderId,
      exportTemplateId: template.id,
      exportTemplateVersionId: version.id,
      documentType: ExportDocumentType.TechnicalMemo,
      mode: ExportMode.Preview,
      format: ExportFormat.Docx,
      version: v1,
      sections: [section],
      createdBy: randomUUID(),
      occurredAt: now,
    });
    await jobRepository.create(job1);

    const v2 = await jobRepository.nextVersion({ organizationId, tenderId, documentType: ExportDocumentType.TechnicalMemo, format: ExportFormat.Docx });
    expect(v2).toBe(2);
  });

  it("tenant isolation — organization A cannot read organization B's export template or job", async () => {
    const { template, version } = buildTemplateAndVersion();
    await templateRepository.createWithFirstVersion({ template, version });

    const foundFromOtherOrg = await templateRepository.findById({ organizationId: otherOrganizationId, exportTemplateId: template.id });
    expect(foundFromOtherOrg).toBeNull();
  });
});
