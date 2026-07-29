import { describe, expect, it } from "vitest";
import { buildMinimalXls, buildMinimalXlsx } from "../test-support/xlsx-fixture-builder";
import { InMemoryStorageProvider } from "../test-support/fakes";
import { CorruptedDocumentError, SpreadsheetLimitExceededError } from "../domain/extraction-errors";
import type { ExtractionConfig } from "./extraction-config";
import { XlsxSpreadsheetExtractor } from "./xlsx-spreadsheet-extractor";

function reference(storageKey: string, extension = "xlsx") {
  return {
    organizationId: "org-1",
    documentId: "doc-1",
    storageKey,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension,
    sizeBytes: 1000,
  };
}

function config(overrides?: Partial<ExtractionConfig>): ExtractionConfig {
  return {
    ocrProvider: "tesseract",
    ocrTimeoutMs: 30000,
    ocrMaxRetries: 2,
    ocrRetryDelayMs: 1000,
    ocrMaxFileSizeBytes: 25 * 1024 * 1024,
    ocrSupportedMimeTypes: ["image/png", "image/jpeg"],
    extractionMaxPages: 200,
    extractionMaxCharacters: 2_000_000,
    extractionChunkSize: 2000,
    extractionChunkOverlap: 200,
    extractionMinTextLength: 20,
    extractionMaxFileSizeBytes: 50 * 1024 * 1024,
    extractionMaxSheets: 50,
    extractionMaxRowsPerSheet: 50000,
    extractionMaxImageDimensionPx: 10000,
    ...overrides,
  };
}

/** Exécute réellement `xlsx` (SheetJS, jamais mocké) sur des classeurs construits en mémoire —
 *  mission Sprint 3 §19. */
describe("XlsxSpreadsheetExtractor (real xlsx)", () => {
  it("extracts multiple sheets with names, rows and columns", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed(
      "key-1",
      buildMinimalXlsx([
        { name: "Budget", rows: [["Lot", "Montant"], ["1", 1000], ["2", 2000]] },
        { name: "Planning", rows: [["Tâche", "Date"], ["Kickoff", "2026-08-01"]] },
      ]),
    );
    const extractor = new XlsxSpreadsheetExtractor(storage, config());

    const result = await extractor.extract(reference("key-1"));
    expect(result.sheets.map((s) => s.name)).toEqual(["Budget", "Planning"]);
    expect(result.sheets[0]!.rowCount).toBe(3);
    expect(result.sheets[0]!.columnCount).toBe(2);
    expect(result.sheets[0]!.text).toContain("Montant");
    expect(result.sheets[0]!.text).toContain("1000");
  });

  it("filters out fully-empty rows", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-2", buildMinimalXlsx([{ name: "S1", rows: [["A"], ["", ""], ["B"]] }]));
    const extractor = new XlsxSpreadsheetExtractor(storage, config());

    const result = await extractor.extract(reference("key-2"));
    expect(result.sheets[0]!.rowCount).toBe(2);
  });

  it("reads the legacy .xls (BIFF) format as well", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed("key-3", buildMinimalXls([{ name: "S1", rows: [["Legacy", "Format"]] }]));
    const extractor = new XlsxSpreadsheetExtractor(storage, config());

    const result = await extractor.extract(reference("key-3", "xls"));
    expect(result.sheets[0]!.text).toContain("Legacy");
  });

  it("truncates a sheet larger than the configured character limit, with a warning", async () => {
    const storage = new InMemoryStorageProvider();
    const bigRows = Array.from({ length: 200 }, (_, i) => [`Row-${i}`, "x".repeat(50)]);
    storage.seed("key-4", buildMinimalXlsx([{ name: "Big", rows: bigRows }]));
    const extractor = new XlsxSpreadsheetExtractor(storage, config({ extractionMaxCharacters: 500 }));

    const result = await extractor.extract(reference("key-4"));
    expect(result.sheets[0]!.truncated).toBe(true);
    expect(result.sheets[0]!.text.length).toBe(500);
    expect(result.warnings.some((w) => w.includes("truncated"))).toBe(true);
  });

  // Correction P1-03 — refusé avant de construire le texte de la moindre feuille.
  it("throws SpreadsheetLimitExceededError when the workbook has more sheets than configured", async () => {
    const storage = new InMemoryStorageProvider();
    storage.seed(
      "key-6",
      buildMinimalXlsx([
        { name: "S1", rows: [["a"]] },
        { name: "S2", rows: [["b"]] },
        { name: "S3", rows: [["c"]] },
      ]),
    );
    const extractor = new XlsxSpreadsheetExtractor(storage, config({ extractionMaxSheets: 2 }));

    await expect(extractor.extract(reference("key-6"))).rejects.toThrow(SpreadsheetLimitExceededError);
  });

  // Correction P1-03 — refusé avant de joindre les lignes en texte.
  it("throws SpreadsheetLimitExceededError when a sheet has more rows than configured", async () => {
    const storage = new InMemoryStorageProvider();
    const manyRows = Array.from({ length: 50 }, (_, i) => [`Row-${i}`]);
    storage.seed("key-7", buildMinimalXlsx([{ name: "Big", rows: manyRows }]));
    const extractor = new XlsxSpreadsheetExtractor(storage, config({ extractionMaxRowsPerSheet: 10 }));

    await expect(extractor.extract(reference("key-7"))).rejects.toThrow(SpreadsheetLimitExceededError);
  });

  it("throws a domain CorruptedDocumentError on unparsable content", async () => {
    const storage = new InMemoryStorageProvider();
    // En-tête ZIP (PK\x03\x04) suivi d'octets aléatoires : SheetJS tente un désarchivage XLSX et
    // échoue — contrairement à du texte brut arbitraire, que SheetJS accepte silencieusement
    // comme une feuille CSV à une seule cellule (confirmé empiriquement).
    storage.seed("key-5", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    const extractor = new XlsxSpreadsheetExtractor(storage, config());

    await expect(extractor.extract(reference("key-5"))).rejects.toThrow(CorruptedDocumentError);
  });
});
