import { describe, expect, it } from "vitest";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import { CorruptedDocumentError, EncryptedPdfError } from "../../domain/extraction-errors";
import type { PdfInspectionResult } from "../ports/pdf-inspector";
import type { StoredDocumentReference } from "../ports/stored-document-reference";
import { determineExtractionStrategy } from "./determine-extraction-strategy";

function reference(extension: string, mimeType = "application/octet-stream"): StoredDocumentReference {
  return {
    organizationId: "org-1",
    documentId: "doc-1",
    documentVersionId: "version-1",
    storageKey: "key",
    mimeType,
    extension,
    sizeBytes: 1000,
  };
}

function inspection(overrides: Partial<PdfInspectionResult>): PdfInspectionResult {
  return { pageCount: 5, hasEmbeddedText: true, estimatedScannedPageCount: 0, encrypted: false, corrupted: false, ...overrides };
}

describe("determineExtractionStrategy", () => {
  it("routes a fully native PDF (embedded text everywhere) to NATIVE_TEXT", () => {
    const decision = determineExtractionStrategy(reference("pdf"), inspection({}));
    expect(decision.strategy).toBe(DocumentExtractionStrategy.NativeText);
  });

  it("routes a scanned PDF (no embedded text) to OCR", () => {
    const decision = determineExtractionStrategy(
      reference("pdf"),
      inspection({ hasEmbeddedText: false, estimatedScannedPageCount: 5 }),
    );
    expect(decision.strategy).toBe(DocumentExtractionStrategy.Ocr);
  });

  it("routes a mixed PDF (embedded text + some scanned pages) to NATIVE_TEXT, flagged as mixed", () => {
    const decision = determineExtractionStrategy(
      reference("pdf"),
      inspection({ hasEmbeddedText: true, estimatedScannedPageCount: 2 }),
    );
    expect(decision.strategy).toBe(DocumentExtractionStrategy.NativeText);
    expect(decision.reason).toContain("mixed PDF");
  });

  it("throws EncryptedPdfError for an encrypted PDF", () => {
    expect(() => determineExtractionStrategy(reference("pdf"), inspection({ encrypted: true }))).toThrow(
      EncryptedPdfError,
    );
  });

  it("throws CorruptedDocumentError for a corrupted PDF", () => {
    expect(() => determineExtractionStrategy(reference("pdf"), inspection({ corrupted: true }))).toThrow(
      CorruptedDocumentError,
    );
  });

  it("throws when a PDF is given without an inspection result (never decided on extension alone)", () => {
    expect(() => determineExtractionStrategy(reference("pdf"))).toThrow();
  });

  it.each(["png", "jpg", "jpeg"])("routes a %s image to OCR", (extension) => {
    const decision = determineExtractionStrategy(reference(extension));
    expect(decision.strategy).toBe(DocumentExtractionStrategy.Ocr);
  });

  it("routes DOCX to OFFICE_DOCUMENT", () => {
    expect(determineExtractionStrategy(reference("docx")).strategy).toBe(DocumentExtractionStrategy.OfficeDocument);
  });

  it.each(["xlsx", "xls"])("routes %s to SPREADSHEET", (extension) => {
    expect(determineExtractionStrategy(reference(extension)).strategy).toBe(DocumentExtractionStrategy.Spreadsheet);
  });

  it("routes an unrecognized extension to UNSUPPORTED, never a false extension-only guess", () => {
    const decision = determineExtractionStrategy(reference("exe"));
    expect(decision.strategy).toBe(DocumentExtractionStrategy.Unsupported);
  });

  it("is case-insensitive and tolerates a leading dot on the extension", () => {
    expect(determineExtractionStrategy(reference("PDF"), inspection({})).strategy).toBe(
      DocumentExtractionStrategy.NativeText,
    );
    expect(determineExtractionStrategy(reference(".docx")).strategy).toBe(DocumentExtractionStrategy.OfficeDocument);
  });
});
