import { describe, expect, it } from "vitest";
import { SubmissionPackage } from "./submission-package.aggregate";
import { PackageFile } from "./package-file";
import { PackageStatus } from "./package-status";

const NOW = new Date("2026-09-01T10:00:00.000Z");
const HASH = "c".repeat(64);

function file(archivePath: string, order = 0) {
  return PackageFile.create({
    archivePath,
    sourceType: "EXPORT_ARTIFACT",
    fileName: archivePath,
    mimeType: "application/pdf",
    fileSize: 100,
    fileHash: HASH,
    order,
  });
}

function baseInput(files: PackageFile[]) {
  return {
    id: "pkg-1",
    organizationId: "org-1",
    clientAccountId: "client-1",
    tenderId: "tender-1",
    version: 1,
    validationRunId: "run-1",
    approvalId: "approval-1",
    readinessStatus: "READY_FOR_SUBMISSION",
    files,
    createdBy: "user-1",
    occurredAt: NOW,
  };
}

describe("SubmissionPackage", () => {
  it("refuses an empty package", () => {
    expect(() => SubmissionPackage.create(baseInput([]))).toThrow();
  });

  it("refuses two files sharing the same archive path (collision)", () => {
    expect(() => SubmissionPackage.create(baseInput([file("memo.docx"), file("memo.docx")]))).toThrow();
  });

  it("PENDING -> GENERATING -> COMPLETED freezes the package, no further transition", () => {
    const pkg = SubmissionPackage.create(baseInput([file("memo.docx")]));
    expect(pkg.status).toBe(PackageStatus.Pending);
    pkg.markGenerating();
    pkg.markCompleted({ fileName: "package.zip", mimeType: "application/zip", fileSize: 500, fileHash: HASH, storageKey: "key", occurredAt: NOW });
    expect(pkg.status).toBe(PackageStatus.Completed);
    expect(() => pkg.markGenerating()).toThrow();
  });

  it("PENDING -> GENERATING -> FAILED is terminal", () => {
    const pkg = SubmissionPackage.create(baseInput([file("memo.docx")]));
    pkg.markGenerating();
    pkg.markFailed({ errorCode: "ZIP_ERROR", errorMessage: "boom", occurredAt: NOW });
    expect(pkg.status).toBe(PackageStatus.Failed);
    expect(() => pkg.markCompleted({ fileName: "x", mimeType: "y", fileSize: 1, fileHash: HASH, storageKey: "k", occurredAt: NOW })).toThrow();
  });
});
