import { describe, expect, it } from "vitest";
import { buildEmptyDocx, buildMinimalDocx } from "../test-support/docx-fixture-builder";
import { InMemoryStorageProvider } from "../test-support/fakes";
import { MammothOfficeDocumentExtractor } from "./mammoth-office-document-extractor";

function reference(storageKey: string) {
  return {
    organizationId: "org-1",
    documentId: "doc-1",
    storageKey,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    sizeBytes: 1000,
  };
}

/** Exécute réellement `mammoth` (jamais mocké) sur des DOCX construits en mémoire — mission
 *  Sprint 3 §19. */
describe("MammothOfficeDocumentExtractor (real mammoth)", () => {
  it("extracts heading, paragraph, table and list, preserving document order", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed(
      "key-1",
      await buildMinimalDocx({
        heading: "Cahier des charges",
        paragraph: "Ce document décrit les exigences.",
        table: [
          ["Lot", "Montant"],
          ["1", "1000€"],
        ],
        listItems: ["Exigence A", "Exigence B"],
      }),
    );
    const extractor = new MammothOfficeDocumentExtractor(storage);

    const result = await extractor.extract(reference("key-1"));
    expect(result.elements.map((e) => e.kind)).toEqual(["heading", "paragraph", "table", "list"]);
    expect(result.elements[0]).toMatchObject({ kind: "heading", text: "Cahier des charges", level: 1 });
    expect(result.elements[1]!.text).toContain("exigences");
    expect(result.elements[2]!.text).toContain("Lot");
    expect(result.elements[2]!.text).toContain("Montant");
    expect(result.elements[3]!.text).toContain("Exigence A");
    expect(result.elements[3]!.text).toContain("Exigence B");
  });

  it("never collapses the whole document into a single raw string (structure is kept)", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-2", await buildMinimalDocx());
    const extractor = new MammothOfficeDocumentExtractor(storage);

    const result = await extractor.extract(reference("key-2"));
    expect(result.elements.length).toBeGreaterThan(1);
  });

  it("handles an empty document without crashing, flagging it via a warning", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-3", await buildEmptyDocx());
    const extractor = new MammothOfficeDocumentExtractor(storage);

    const result = await extractor.extract(reference("key-3"));
    expect(result.elements).toHaveLength(0);
    expect(result.warnings).toContain("the document produced no extractable element");
  });
});
