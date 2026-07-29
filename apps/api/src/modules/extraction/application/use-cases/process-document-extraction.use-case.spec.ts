import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "../../../documents/domain/document.aggregate";
import type { DocumentVersion } from "../../../documents/domain/document-version.entity";
import type { DocumentRepository, DocumentVersionRepository, StorageProvider } from "../../../documents";
import type { Tender } from "../../../tenders/domain/tender.aggregate";
import type { TenderRepository } from "../../../tenders";
import { DceDocumentProcessingStatus, type DceDocumentRepository } from "../../../dce";
import { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import { DocumentExtractionStatus } from "../../domain/document-extraction-status";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import {
  FakeNativeTextExtractor,
  FakeOcrProvider,
  FakeOfficeDocumentExtractor,
  FakePdfInspector,
  FakePdfRasterizer,
  FakeSpreadsheetExtractor,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryDocumentExtractionRepository,
  InMemoryExtractionAttemptRepository,
  InMemoryExtractionChunkRepository,
} from "../../test-support/fakes";
import { DeterministicTextSegmenter } from "../../infrastructure/deterministic-text-segmenter";
import type { ExtractionConfig } from "../../infrastructure/extraction-config";
import { ProcessDocumentExtractionUseCase } from "./process-document-extraction.use-case";

const NOW = new Date("2026-07-27T10:00:00Z");
const ORG = "org-1";
const TENDER = "tender-1";
const DCE = "dce-1";
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

function fakeTender(language: string | undefined = "fr"): Tender {
  return { language } as unknown as Tender;
}

describe("ProcessDocumentExtractionUseCase", () => {
  let extractionRepository: InMemoryDocumentExtractionRepository;
  let attemptRepository: InMemoryExtractionAttemptRepository;
  let chunkRepository: InMemoryExtractionChunkRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let documentRepository: { findById: ReturnType<typeof vi.fn> };
  let documentVersionRepository: { findById: ReturnType<typeof vi.fn> };
  let storageProvider: { openReadStream: ReturnType<typeof vi.fn> };
  let dceDocumentRepository: { updateProcessingStatus: ReturnType<typeof vi.fn> };
  let tenderRepository: { findById: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    chunkRepository = new InMemoryExtractionChunkRepository();
    extractionRepository = new InMemoryDocumentExtractionRepository(chunkRepository);
    await extractionRepository.create(
      DocumentExtraction.create({ documentId: DOCUMENT, dceId: DCE, organizationId: ORG, occurredAt: NOW }),
    );
    attemptRepository = new InMemoryExtractionAttemptRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    documentRepository = { findById: vi.fn(async () => fakeDocument()) };
    documentVersionRepository = { findById: vi.fn(async () => fakeDocumentVersion()) };
    storageProvider = { openReadStream: vi.fn() };
    dceDocumentRepository = { updateProcessingStatus: vi.fn(async () => undefined) };
    tenderRepository = { findById: vi.fn(async () => fakeTender()) };
  });

  function buildUseCase(input: {
    pdfInspection?: ConstructorParameters<typeof FakePdfInspector>[0];
    nativeResult?: ConstructorParameters<typeof FakeNativeTextExtractor>[0];
    ocrProvider?: FakeOcrProvider;
    pdfRasterizer?: FakePdfRasterizer;
    officeExtractor?: FakeOfficeDocumentExtractor;
    spreadsheetExtractor?: FakeSpreadsheetExtractor;
    extractionConfig?: ExtractionConfig;
  }): ProcessDocumentExtractionUseCase {
    return new ProcessDocumentExtractionUseCase(
      extractionRepository,
      attemptRepository,
      documentRepository as unknown as DocumentRepository,
      documentVersionRepository as unknown as DocumentVersionRepository,
      storageProvider as unknown as StorageProvider,
      dceDocumentRepository as unknown as DceDocumentRepository,
      new FakePdfInspector(
        input.pdfInspection ?? {
          pageCount: 1,
          hasEmbeddedText: true,
          estimatedScannedPageCount: 0,
          encrypted: false,
          corrupted: false,
        },
      ),
      new FakeNativeTextExtractor(input.nativeResult ?? { pages: [], metadata: {}, warnings: [] }),
      input.pdfRasterizer ?? new FakePdfRasterizer(),
      input.ocrProvider ?? new FakeOcrProvider(),
      input.officeExtractor ?? new FakeOfficeDocumentExtractor({ elements: [], warnings: [] }),
      input.spreadsheetExtractor ?? new FakeSpreadsheetExtractor({ sheets: [], warnings: [] }),
      new DeterministicTextSegmenter(),
      auditLogWriter,
      input.extractionConfig ?? config(),
      tenderRepository as unknown as TenderRepository,
      new FixedClock(NOW),
    );
  }

  it("processes a fully native PDF end-to-end: SUCCEEDED, chunks persisted, DceDocument mirrored to READY_FOR_ANALYSIS", async () => {
    const useCase = buildUseCase({
      nativeResult: {
        pages: [
          { pageNumber: 1, text: "This is a long enough paragraph of native PDF text.", characterCount: 53 },
        ],
        metadata: {},
        warnings: [],
      },
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.Succeeded);
    expect(extraction?.strategy).toBe(DocumentExtractionStrategy.NativeText);

    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(chunks.length).toBeGreaterThan(0);

    expect(dceDocumentRepository.updateProcessingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: DceDocumentProcessingStatus.ReadyForAnalysis }),
    );
  });

  it("is idempotent: a second execute() call while already SUCCEEDED is a silent no-op (never reprocesses)", async () => {
    const useCase = buildUseCase({
      nativeResult: {
        pages: [{ pageNumber: 1, text: "Enough native text to pass the minimum length threshold.", characterCount: 58 }],
        metadata: {},
        warnings: [],
      },
    });
    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });
    const chunksAfterFirst = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    const attemptsAfterFirst = await attemptRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });
    const chunksAfterSecond = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    const attemptsAfterSecond = await attemptRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });

    expect(chunksAfterSecond).toHaveLength(chunksAfterFirst.length);
    expect(attemptsAfterSecond).toHaveLength(attemptsAfterFirst.length);
  });

  it("mixed PDF: only the page with empty native text is sent through targeted OCR, merged back into place", async () => {
    const ocrProvider = new FakeOcrProvider({
      text: "recovered by OCR, long enough to pass the threshold easily.",
      durationMs: 5,
      provider: "fake-ocr",
      warnings: [],
    });
    const useCase = buildUseCase({
      nativeResult: {
        pages: [
          { pageNumber: 1, text: "Native text page, long enough on its own already.", characterCount: 51 },
          { pageNumber: 2, text: "", characterCount: 0 },
        ],
        metadata: {},
        warnings: ["page 2 has no extractable native text"],
      },
      ocrProvider,
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    expect(ocrProvider.calls).toHaveLength(1);
    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    const allText = chunks.map((c) => c.content).join(" ");
    expect(allText).toContain("recovered by OCR");
    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    // PARTIALLY_SUCCEEDED, jamais SUCCEEDED sans réserve : une page recouvrée par OCR ciblé
    // laisse un warning honnête sur le résultat final (mission §18 "ne cache pas les limites").
    expect(extraction?.status).toBe(DocumentExtractionStatus.PartiallySucceeded);
  });

  it("routes a direct image document through OCR using the stored bytes, without ever calling the PDF inspector for pages", async () => {
    documentVersionRepository.findById = vi.fn(async () =>
      fakeDocumentVersion({ mimeType: "image/png", extension: "png" }),
    );
    storageProvider.openReadStream = vi.fn(async () => {
      const { Readable } = await import("node:stream");
      return Readable.from(Buffer.from("fake-image-bytes"));
    });
    const ocrProvider = new FakeOcrProvider({
      text: "Image OCR text long enough to pass the minimum threshold.",
      durationMs: 5,
      provider: "fake-ocr",
      warnings: [],
    });
    const useCase = buildUseCase({
      pdfInspection: { pageCount: 1, hasEmbeddedText: false, estimatedScannedPageCount: 1, encrypted: false, corrupted: false },
      ocrProvider,
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    expect(ocrProvider.calls).toHaveLength(1);
    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.strategy).toBe(DocumentExtractionStrategy.Ocr);
    expect(extraction?.status).toBe(DocumentExtractionStatus.Succeeded);
  });

  it("marks the extraction FAILED (never SUCCEEDED) when the extraction produces zero usable characters", async () => {
    const useCase = buildUseCase({ nativeResult: { pages: [{ pageNumber: 1, text: "", characterCount: 0 }], metadata: {}, warnings: [] } });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.Failed);
    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(chunks).toHaveLength(0);
    expect(dceDocumentRepository.updateProcessingStatus).not.toHaveBeenCalled();
  });

  it("marks the extraction PARTIALLY_SUCCEEDED (mirrored as READY_FOR_ANALYSIS_WITH_WARNINGS) when below the minimum text length threshold", async () => {
    const useCase = buildUseCase({
      nativeResult: { pages: [{ pageNumber: 1, text: "short", characterCount: 5 }], metadata: {}, warnings: [] },
      extractionConfig: config({ extractionMinTextLength: 100 }),
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.PartiallySucceeded);
    expect(dceDocumentRepository.updateProcessingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ processingStatus: DceDocumentProcessingStatus.ReadyForAnalysisWithWarnings }),
    );
  });

  it("marks NOT_PROCESSABLE for an unsupported format and never attempts extraction", async () => {
    documentVersionRepository.findById = vi.fn(async () =>
      fakeDocumentVersion({ extension: "exe", mimeType: "application/octet-stream" }),
    );
    const useCase = buildUseCase({});

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.NotProcessable);
    expect(dceDocumentRepository.updateProcessingStatus).not.toHaveBeenCalled();
  });

  // Correction P1-02 — Phase 1 (réservation).
  it("never reprocesses a document already reserved (PROCESSING) by a concurrent/earlier call", async () => {
    const reservation = await extractionRepository.reserveForProcessing({
      organizationId: ORG,
      documentId: DOCUMENT,
      occurredAt: NOW,
    });
    expect(reservation.kind).toBe("reserved");

    // Une seconde réservation, pendant que la première est encore "en cours" (statut PROCESSING
    // jamais redescendu), doit être un no-op explicite — jamais une exception, jamais un second
    // traitement.
    const secondReservation = await extractionRepository.reserveForProcessing({
      organizationId: ORG,
      documentId: DOCUMENT,
      occurredAt: NOW,
    });
    expect(secondReservation).toEqual({ kind: "not_startable", status: DocumentExtractionStatus.Processing });
  });

  // Correction P1-02 — Phase 3 (finalisation), compare-and-set.
  it("discards a finalization whose expectedAttemptCount no longer matches the current attempt (stale reservation)", async () => {
    await extractionRepository.reserveForProcessing({ organizationId: ORG, documentId: DOCUMENT, occurredAt: NOW });

    const result = await extractionRepository.finalizeAttempt({
      organizationId: ORG,
      documentId: DOCUMENT,
      expectedAttemptCount: 999, // jamais le compte réel (1) : simule une tentative obsolète.
      occurredAt: NOW,
      outcome: { kind: "not_processable" },
    });

    expect(result.applied).toBe(false);
    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    // Toujours PROCESSING : la finalisation obsolète n'a rien écrasé.
    expect(extraction?.status).toBe(DocumentExtractionStatus.Processing);
  });

  // Correction P1-03 — taille de fichier.
  it("marks the extraction FAILED when the file size exceeds the configured maximum, before reading any content", async () => {
    documentVersionRepository.findById = vi.fn(async () => fakeDocumentVersion({ sizeBytes: 999_999_999 }));
    const useCase = buildUseCase({ extractionConfig: config({ extractionMaxFileSizeBytes: 1000 }) });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.Failed);
    expect(extraction?.lastError).toContain("exceeds the configured maximum");
  });

  // Correction P1-03 — nombre de pages, jamais rasterisé avant vérification.
  it("marks the extraction FAILED when a PDF exceeds the configured page limit, without rasterizing any page", async () => {
    const pdfRasterizer = new FakePdfRasterizer();
    const rasterizeSpy = vi.spyOn(pdfRasterizer, "rasterizePages");
    const useCase = buildUseCase({
      pdfInspection: { pageCount: 500, hasEmbeddedText: false, estimatedScannedPageCount: 500, encrypted: false, corrupted: false },
      pdfRasterizer,
      extractionConfig: config({ extractionMaxPages: 200 }),
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.Failed);
    expect(extraction?.lastError).toContain("exceeding the configured maximum");
    expect(rasterizeSpy).not.toHaveBeenCalled();
  });

  // Correction P1-03 — nombre de caractères, arrêté proprement avant normalisation/segmentation.
  it("marks the extraction FAILED when extracted content exceeds the configured character limit", async () => {
    const useCase = buildUseCase({
      nativeResult: {
        pages: [{ pageNumber: 1, text: "x".repeat(1000), characterCount: 1000 }],
        metadata: {},
        warnings: [],
      },
      extractionConfig: config({ extractionMaxCharacters: 500 }),
    });

    await useCase.execute({ organizationId: ORG, tenderId: TENDER, dceId: DCE, documentId: DOCUMENT });

    const extraction = await extractionRepository.findByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(extraction?.status).toBe(DocumentExtractionStatus.Failed);
    expect(extraction?.lastError).toContain("exceeding the configured maximum");
    const chunks = await chunkRepository.listByDocumentId({ organizationId: ORG, documentId: DOCUMENT });
    expect(chunks).toHaveLength(0);
  });
});
