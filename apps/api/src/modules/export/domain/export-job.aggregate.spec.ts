import { describe, expect, it } from "vitest";
import { ExportJob } from "./export-job.aggregate";
import { ExportSectionSelection, ExportSectionValidationStatus } from "./export-section-selection";
import { ExportSectionSource } from "./export-section-source";
import { ExportFormat } from "./export-format";
import { ExportMode } from "./export-mode";
import { ExportStatus } from "./export-status";

const NOW = new Date("2026-09-01T10:00:00.000Z");

function section() {
  return ExportSectionSelection.create({
    sectionId: "SUMMARY",
    sourceType: ExportSectionSource.Generation,
    generationId: "gen-1",
    validationStatus: ExportSectionValidationStatus.Validated,
    selectedBy: "user-1",
    selectedAt: NOW,
    order: 0,
  });
}

function baseInput(overrides: Partial<Parameters<typeof ExportJob.create>[0]> = {}) {
  return {
    id: "job-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    exportTemplateId: "tpl-1",
    exportTemplateVersionId: "tplv-1",
    documentType: "TECHNICAL_MEMO",
    mode: ExportMode.Preview,
    format: ExportFormat.Docx,
    version: 1,
    sections: [section()],
    createdBy: "user-1",
    occurredAt: NOW,
    ...overrides,
  };
}

describe("ExportJob", () => {
  it("rejects an export with no sections selected", () => {
    expect(() => ExportJob.create(baseInput({ sections: [] }))).toThrow();
  });

  it("rejects a FINAL export not based on an approved PREVIEW", () => {
    expect(() => ExportJob.create(baseInput({ mode: ExportMode.Final }))).toThrow();
  });

  it("accepts a FINAL export based on a PREVIEW export job", () => {
    const job = ExportJob.create(baseInput({ mode: ExportMode.Final, basedOnExportJobId: "preview-job-1" }));
    expect(job.basedOnExportJobId).toBe("preview-job-1");
  });

  it("follows PENDING -> GENERATING -> COMPLETED, never reopening after", () => {
    const job = ExportJob.create(baseInput());
    expect(job.status).toBe(ExportStatus.Pending);
    job.markGenerating();
    expect(job.status).toBe(ExportStatus.Generating);
    job.markCompleted(NOW);
    expect(job.status).toBe(ExportStatus.Completed);
    expect(() => job.markGenerating()).toThrow();
  });

  it("PENDING -> GENERATING -> FAILED records the error, never reopening after", () => {
    const job = ExportJob.create(baseInput());
    job.markGenerating();
    job.markFailed({ errorCode: "RENDER_FAILED", errorMessage: "boom", occurredAt: NOW });
    expect(job.status).toBe(ExportStatus.Failed);
    expect(job.errorCode).toBe("RENDER_FAILED");
    expect(() => job.markGenerating()).toThrow();
  });

  it("refuses to be used as a signature source unless FINAL and COMPLETED", () => {
    const preview = ExportJob.create(baseInput());
    preview.markGenerating();
    preview.markCompleted(NOW);
    expect(() => preview.assertUsableAsFinalArtifactSource()).toThrow();

    const final = ExportJob.create(baseInput({ mode: ExportMode.Final, basedOnExportJobId: "preview-job-1" }));
    expect(() => final.assertUsableAsFinalArtifactSource()).toThrow(); // still PENDING
    final.markGenerating();
    final.markCompleted(NOW);
    expect(() => final.assertUsableAsFinalArtifactSource()).not.toThrow();
  });
});
