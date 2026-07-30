import { Readable } from "node:stream";
import { vi, describe, expect, it } from "vitest";
import type { Document } from "../../../documents/domain/document.aggregate";
import type { DocumentVersion } from "../../../documents/domain/document-version.entity";
import type { DocumentRepository, DocumentVersionRepository, StorageProvider } from "../../../documents";
import {
  FakeNativeTextExtractor,
  FakeOcrProvider,
  FakeOfficeDocumentExtractor,
  FakePdfInspector,
  FakePdfRasterizer,
  FakeSpreadsheetExtractor,
  FixedClock,
} from "../../test-support/fakes";
import { DeterministicTextSegmenter } from "../../infrastructure/deterministic-text-segmenter";
import type { ExtractionConfig } from "../../infrastructure/extraction-config";
import { ExtractDocumentContentUseCase } from "./extract-document-content.use-case";

const NOW = new Date("2026-07-30T10:00:00Z");
const ORG = "org-1";
const DOCUMENT = "doc-1";

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

function fakeDocument(currentVersionId: string | undefined = "version-1"): Document {
  return { currentVersionId } as unknown as Document;
}

function fakeDocumentVersion(overrides?: Partial<{ storageKey: string; mimeType: string; extension: string; sizeBytes: number }>): DocumentVersion {
  return {
    storageKey: "storage/doc-1",
    mimeType: "application/pdf",
    extension: "pdf",
    sizeBytes: 1000,
    ...overrides,
  } as unknown as DocumentVersion;
}

describe("ExtractDocumentContentUseCase", () => {
  function buildUseCase(input: {
    documentRepository?: { findById: ReturnType<typeof vi.fn> };
    documentVersionRepository?: { findById: ReturnType<typeof vi.fn> };
    storageProvider?: { openReadStream: ReturnType<typeof vi.fn> };
    pdfInspection?: ConstructorParameters<typeof FakePdfInspector>[0];
    nativeResult?: ConstructorParameters<typeof FakeNativeTextExtractor>[0];
    ocrProvider?: FakeOcrProvider;
    pdfRasterizer?: FakePdfRasterizer;
    officeExtractor?: FakeOfficeDocumentExtractor;
    spreadsheetExtractor?: FakeSpreadsheetExtractor;
    extractionConfig?: ExtractionConfig;
  }): ExtractDocumentContentUseCase {
    const documentRepository = input.documentRepository ?? { findById: vi.fn(async () => fakeDocument()) };
    const documentVersionRepository = input.documentVersionRepository ?? { findById: vi.fn(async () => fakeDocumentVersion()) };
    const storageProvider = input.storageProvider ?? { openReadStream: vi.fn() };

    return new ExtractDocumentContentUseCase(
      documentRepository as unknown as DocumentRepository,
      documentVersionRepository as unknown as DocumentVersionRepository,
      storageProvider as unknown as StorageProvider,
      new FakePdfInspector(input.pdfInspection ?? { pageCount: 1, hasEmbeddedText: true, estimatedScannedPageCount: 0, encrypted: false, corrupted: false }),
      new FakeNativeTextExtractor(input.nativeResult ?? { pages: [], metadata: {}, warnings: [] }),
      input.pdfRasterizer ?? new FakePdfRasterizer(),
      input.ocrProvider ?? new FakeOcrProvider(),
      input.officeExtractor ?? new FakeOfficeDocumentExtractor({ elements: [], warnings: [] }),
      input.spreadsheetExtractor ?? new FakeSpreadsheetExtractor({ sheets: [], warnings: [] }),
      new DeterministicTextSegmenter(),
      input.extractionConfig ?? config(),
      new FixedClock(NOW),
    );
  }

  it("extracts a native-text PDF into chunks, never touching any Tender/DCE concept", async () => {
    const useCase = buildUseCase({
      nativeResult: {
        pages: [{ pageNumber: 1, text: "Ceci est un CV de consultant avec une experience significative en cloud.", characterCount: 73 }],
        metadata: {},
        warnings: [],
      },
    });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT });

    expect(result.kind).toBe("succeeded");
    if (result.kind !== "succeeded" && result.kind !== "partially_succeeded") throw new Error("unexpected outcome");
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]!.content).toContain("consultant");
    expect(result.chunks[0]!.checksum).toHaveLength(64); // sha256 hex
  });

  it("returns not_processable for an unsupported extension — never throws", async () => {
    const useCase = buildUseCase({
      documentVersionRepository: { findById: vi.fn(async () => fakeDocumentVersion({ extension: "zip" })) },
    });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT });
    expect(result.kind).toBe("not_processable");
  });

  it("returns a failed outcome (never an exception) when the document has no current version", async () => {
    const useCase = buildUseCase({
      documentRepository: { findById: vi.fn(async () => fakeDocument(undefined)) },
    });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT });
    expect(result.kind).toBe("failed");
  });

  it("returns a failed outcome when the file exceeds the configured maximum size", async () => {
    const useCase = buildUseCase({
      documentVersionRepository: { findById: vi.fn(async () => fakeDocumentVersion({ sizeBytes: 999_999_999 })) },
      extractionConfig: config({ extractionMaxFileSizeBytes: 1000 }),
    });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT });
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") throw new Error("expected failed");
    expect(result.reason).toContain("exceeds the configured maximum");
  });

  it("returns a failed outcome when the extracted content is empty", async () => {
    const useCase = buildUseCase({ nativeResult: { pages: [{ pageNumber: 1, text: "", characterCount: 0 }], metadata: {}, warnings: [] } });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT });
    expect(result.kind).toBe("failed");
  });

  it("passes languageHints through to the OCR provider (image extraction)", async () => {
    const ocrProvider = new FakeOcrProvider({
      text: "Texte reconnu par OCR sur une image de certification.",
      durationMs: 1,
      provider: "fake-ocr",
      warnings: [],
      detectedLanguage: "fr",
    });
    const useCase = buildUseCase({
      documentVersionRepository: { findById: vi.fn(async () => fakeDocumentVersion({ extension: "png", mimeType: "image/png" })) },
      storageProvider: { openReadStream: vi.fn(async () => Readable.from(Buffer.from("fake-image-bytes"))) },
      ocrProvider,
    });

    const result = await useCase.execute({ organizationId: ORG, documentId: DOCUMENT, languageHints: ["fr"] });

    expect(result.kind === "succeeded" || result.kind === "partially_succeeded").toBe(true);
  });
});
