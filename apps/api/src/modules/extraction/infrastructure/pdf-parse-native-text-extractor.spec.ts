import { describe, expect, it } from "vitest";
import { buildMinimalPdf } from "../test-support/pdf-fixture-builder";
import { InMemoryStorageProvider } from "../test-support/fakes";
import { CorruptedDocumentError } from "../domain/extraction-errors";
import { PdfParseNativeTextExtractor } from "./pdf-parse-native-text-extractor";

function reference(storageKey: string) {
  return {
    organizationId: "org-1",
    documentId: "doc-1",
    documentVersionId: "version-1",
    storageKey,
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 1000,
  };
}

/** Exécute réellement `pdf-parse` (jamais mocké) sur des PDF construits en mémoire — mission
 *  Sprint 3 §19. */
describe("PdfParseNativeTextExtractor (real pdf-parse)", () => {
  it("extracts per-page text, page number, order, and character count", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-1", buildMinimalPdf(["First page content", "Second page content"]));
    const extractor = new PdfParseNativeTextExtractor(storage);

    const result = await extractor.extract(reference("key-1"));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.pageNumber).toBe(1);
    expect(result.pages[0]!.text).toContain("First page content");
    expect(result.pages[0]!.characterCount).toBe(result.pages[0]!.text.length);
    expect(result.pages[1]!.pageNumber).toBe(2);
    expect(result.pages[1]!.text).toContain("Second page content");
    expect(result.warnings).toHaveLength(0);
  });

  it("warns (but does not fail) on a page with no extractable text", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-2", buildMinimalPdf(["Has text", ""]));
    const extractor = new PdfParseNativeTextExtractor(storage);

    const result = await extractor.extract(reference("key-2"));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]!.text.trim()).toBe("");
    expect(result.warnings.some((warning) => warning.includes("page 2"))).toBe(true);
  });

  it("handles a PDF with no text on any page (empty document) without crashing", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-3", buildMinimalPdf(["", ""]));
    const extractor = new PdfParseNativeTextExtractor(storage);

    const result = await extractor.extract(reference("key-3"));
    expect(result.pages).toHaveLength(2);
    expect(result.warnings).toHaveLength(2);
  });

  it("throws a domain CorruptedDocumentError (never a raw pdf-parse exception) on invalid content", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-4", Buffer.from("%PDF-1.4\ntotally broken content"));
    const extractor = new PdfParseNativeTextExtractor(storage);

    await expect(extractor.extract(reference("key-4"))).rejects.toThrow(CorruptedDocumentError);
  });
});
