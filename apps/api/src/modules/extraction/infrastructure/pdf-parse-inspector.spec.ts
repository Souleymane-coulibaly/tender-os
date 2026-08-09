import { describe, expect, it } from "vitest";
import { buildMinimalPdf } from "../test-support/pdf-fixture-builder";
import { InMemoryStorageProvider } from "../test-support/fakes";
import { PdfParseInspector } from "./pdf-parse-inspector";

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

/** Ces tests exécutent réellement `pdf-parse` sur des PDF construits en mémoire (jamais un mock
 *  de la bibliothèque) — mission Sprint 3 §19 : preuve réelle, pas seulement théorique. */
describe("PdfParseInspector (real pdf-parse)", () => {
  it("detects embedded text on every page of a fully native PDF", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-1", buildMinimalPdf(["Hello page one", "Hello page two"]));
    const inspector = new PdfParseInspector(storage);

    const result = await inspector.inspect(reference("key-1"));
    expect(result.pageCount).toBe(2);
    expect(result.hasEmbeddedText).toBe(true);
    expect(result.estimatedScannedPageCount).toBe(0);
    expect(result.encrypted).toBe(false);
    expect(result.corrupted).toBe(false);
  });

  it("estimates scanned pages from pages without any embedded text", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-2", buildMinimalPdf(["Real text here", ""]));
    const inspector = new PdfParseInspector(storage);

    const result = await inspector.inspect(reference("key-2"));
    expect(result.pageCount).toBe(2);
    expect(result.hasEmbeddedText).toBe(true);
    expect(result.estimatedScannedPageCount).toBe(1);
  });

  it("marks a structurally corrupted PDF as corrupted, never throwing a raw parser exception", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-3", Buffer.from("%PDF-1.4\nnot a real pdf body at all"));
    const inspector = new PdfParseInspector(storage);

    const result = await inspector.inspect(reference("key-3"));
    expect(result.corrupted).toBe(true);
  });
});
