import { describe, expect, it } from "vitest";
import { DceDocumentProcessingStatus, determineDceDocumentProcessingStatus } from "./dce-document-processing-status";

describe("determineDceDocumentProcessingStatus", () => {
  it("marks a PDF as PENDING_TEXT_INSPECTION (scanned vs text cannot be decided without opening the content)", () => {
    expect(determineDceDocumentProcessingStatus("pdf")).toBe(DceDocumentProcessingStatus.PendingTextInspection);
    expect(determineDceDocumentProcessingStatus(".PDF")).toBe(DceDocumentProcessingStatus.PendingTextInspection);
  });

  it("marks PNG and JPEG as READY_FOR_OCR", () => {
    expect(determineDceDocumentProcessingStatus("png")).toBe(DceDocumentProcessingStatus.ReadyForOcr);
    expect(determineDceDocumentProcessingStatus("jpg")).toBe(DceDocumentProcessingStatus.ReadyForOcr);
    expect(determineDceDocumentProcessingStatus("jpeg")).toBe(DceDocumentProcessingStatus.ReadyForOcr);
  });

  it("marks DOCX as READY_FOR_NATIVE_EXTRACTION, never OCR", () => {
    expect(determineDceDocumentProcessingStatus("docx")).toBe(DceDocumentProcessingStatus.ReadyForNativeExtraction);
  });

  it("marks XLSX and legacy XLS as READY_FOR_NATIVE_EXTRACTION, never OCR", () => {
    expect(determineDceDocumentProcessingStatus("xlsx")).toBe(DceDocumentProcessingStatus.ReadyForNativeExtraction);
    expect(determineDceDocumentProcessingStatus("xls")).toBe(DceDocumentProcessingStatus.ReadyForNativeExtraction);
  });

  it("marks an unrecognized/unsupported extension as NOT_PROCESSABLE, never a false READY_FOR_OCR", () => {
    expect(determineDceDocumentProcessingStatus("exe")).toBe(DceDocumentProcessingStatus.NotProcessable);
    expect(determineDceDocumentProcessingStatus("")).toBe(DceDocumentProcessingStatus.NotProcessable);
  });
});
