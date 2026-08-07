import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetTenderUseCase } from "../../../tenders";
import type { Dce } from "../../../dce/domain/dce.aggregate";
import type { DceDocumentRepository, DceRepository } from "../../../dce";
import { DocumentExtraction } from "../../domain/document-extraction.aggregate";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import { DocumentExtractionStatus } from "../../domain/document-extraction-status";
import { DocumentExtractionNotFoundError, ExtractionNotReadyForAnalysisError } from "../../domain/extraction-errors";
import { ExtractionChunk } from "../../domain/extraction-chunk.entity";
import {
  InMemoryDocumentExtractionRepository,
  InMemoryExtractionChunkRepository,
} from "../../test-support/fakes";
import { GetDocumentAnalysisInputUseCase } from "./get-document-analysis-input.use-case";

const NOW = new Date("2026-07-27T10:00:00Z");
const ORG = "org-1";
const OTHER_ORG = "org-2";
const TENDER = "tender-1";
const DCE_ID = "dce-1";
const DOCUMENT = "doc-1";

function fakeDce(): Dce {
  return { id: { value: DCE_ID }, organizationId: ORG, tenderId: TENDER } as unknown as Dce;
}

describe("GetDocumentAnalysisInputUseCase", () => {
  let extractionRepository: InMemoryDocumentExtractionRepository;
  let chunkRepository: InMemoryExtractionChunkRepository;
  let dceRepository: { findByTenderId: ReturnType<typeof vi.fn> };
  let dceDocumentRepository: { getSummaryByDocumentId: ReturnType<typeof vi.fn> };
  let getTenderUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    chunkRepository = new InMemoryExtractionChunkRepository();
    extractionRepository = new InMemoryDocumentExtractionRepository(chunkRepository);
    dceRepository = { findByTenderId: vi.fn(async () => fakeDce()) };
    dceDocumentRepository = {
      getSummaryByDocumentId: vi.fn(async () => ({
        dceId: DCE_ID,
        documentId: DOCUMENT,
        originalFilename: "cctp.pdf",
        sanitizedFilename: "cctp.pdf",
        mimeType: "application/pdf",
        extension: "pdf",
        sizeBytes: 1000,
        checksum: "abc",
        currentVersionNumber: 1,
        currentVersionId: "doc-1-version-1",
        category: "TECHNICAL",
        processingStatus: "READY_FOR_ANALYSIS",
        createdByUserId: "user-1",
        createdAt: NOW.toISOString(),
      })),
    };
    getTenderUseCase = { execute: vi.fn(async () => ({ id: TENDER, organizationId: ORG })) };
  });

  function buildUseCase(): GetDocumentAnalysisInputUseCase {
    return new GetDocumentAnalysisInputUseCase(
      extractionRepository,
      chunkRepository,
      dceRepository as unknown as DceRepository,
      dceDocumentRepository as unknown as DceDocumentRepository,
      getTenderUseCase as unknown as GetTenderUseCase,
    );
  }

  async function seedSucceededExtraction(input?: {
    status?: typeof DocumentExtractionStatus[keyof typeof DocumentExtractionStatus];
    organizationId?: string;
  }): Promise<void> {
    const extraction = DocumentExtraction.create({
      documentId: DOCUMENT,
      dceId: DCE_ID,
      organizationId: input?.organizationId ?? ORG,
      occurredAt: NOW,
    });
    extraction.reserve(NOW);
    if ((input?.status ?? DocumentExtractionStatus.Succeeded) === DocumentExtractionStatus.PartiallySucceeded) {
      extraction.complete(
        { outcome: DocumentExtractionStatus.PartiallySucceeded, strategy: DocumentExtractionStrategy.NativeText, warnings: ["partial"] },
        NOW,
      );
    } else if (input?.status === DocumentExtractionStatus.Failed) {
      extraction.fail({ reason: "boom" }, NOW);
    } else if (input?.status === DocumentExtractionStatus.Processing) {
      // déjà PROCESSING après reserve() — rien à faire de plus.
    } else {
      extraction.complete(
        { outcome: DocumentExtractionStatus.Succeeded, strategy: DocumentExtractionStrategy.NativeText, warnings: [] },
        NOW,
      );
    }
    await extractionRepository.create(extraction);

    await chunkRepository.replaceChunks({
      organizationId: input?.organizationId ?? ORG,
      documentId: DOCUMENT,
      chunks: [
        ExtractionChunk.create({
          id: "chunk-2",
          documentId: DOCUMENT,
          organizationId: input?.organizationId ?? ORG,
          sequence: 1,
          content: "Second chunk.",
          occurredAt: NOW,
        }),
        ExtractionChunk.create({
          id: "chunk-1",
          documentId: DOCUMENT,
          organizationId: input?.organizationId ?? ORG,
          sequence: 0,
          content: "First chunk.",
          occurredAt: NOW,
        }),
      ],
    });
  }

  it("returns the ordered corpus with metadata for a SUCCEEDED extraction", async () => {
    await seedSucceededExtraction();
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" });

    expect(result.organizationId).toBe(ORG);
    expect(result.tenderId).toBe(TENDER);
    expect(result.dceId).toBe(DCE_ID);
    expect(result.documentId).toBe(DOCUMENT);
    expect(result.documentName).toBe("cctp.pdf");
    expect(result.documentType).toBe("TECHNICAL");
    expect(result.documentVersionId).toBe("doc-1-version-1");
    expect(result.extractionStatus).toBe(DocumentExtractionStatus.Succeeded);
    expect(result.partial).toBe(false);
    // Ordre déterministe garanti par sequence, jamais l'ordre d'insertion.
    expect(result.chunks.map((c) => c.sequence)).toEqual([0, 1]);
    expect(result.chunks[0]!.content).toBe("First chunk.");
  });

  it("returns partial=true and PARTIALLY_SUCCEEDED for a partially-succeeded extraction", async () => {
    await seedSucceededExtraction({ status: DocumentExtractionStatus.PartiallySucceeded });
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" });

    expect(result.extractionStatus).toBe(DocumentExtractionStatus.PartiallySucceeded);
    expect(result.partial).toBe(true);
    expect(result.warnings).toContain("partial");
  });

  it("refuses a PROCESSING extraction (not ready yet)", async () => {
    await seedSucceededExtraction({ status: DocumentExtractionStatus.Processing });
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" }),
    ).rejects.toThrow(ExtractionNotReadyForAnalysisError);
  });

  it("refuses a FAILED extraction", async () => {
    await seedSucceededExtraction({ status: DocumentExtractionStatus.Failed });
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" }),
    ).rejects.toThrow(ExtractionNotReadyForAnalysisError);
  });

  it("refuses a document that has no extraction at all", async () => {
    const useCase = buildUseCase();
    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: "unknown-doc", actorRole: "CONTRIBUTOR" }),
    ).rejects.toThrow(DocumentExtractionNotFoundError);
  });

  it("refuses a document belonging to another organization (multi-tenant isolation)", async () => {
    await seedSucceededExtraction({ organizationId: OTHER_ORG });
    dceRepository.findByTenderId = vi.fn(async () => null); // org A n'a pas ce DCE pour ce tenderId.
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" }),
    ).rejects.toThrow(DocumentExtractionNotFoundError);
  });

  it("never returns an empty chunk", async () => {
    await seedSucceededExtraction();
    await chunkRepository.replaceChunks({
      organizationId: ORG,
      documentId: DOCUMENT,
      chunks: [
        ExtractionChunk.create({ id: "chunk-empty", documentId: DOCUMENT, organizationId: ORG, sequence: 0, content: "   ", occurredAt: NOW }),
        ExtractionChunk.create({ id: "chunk-real", documentId: DOCUMENT, organizationId: ORG, sequence: 1, content: "Real.", occurredAt: NOW }),
      ],
    });
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG, tenderId: TENDER, documentId: DOCUMENT, actorRole: "CONTRIBUTOR" });
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.content).toBe("Real.");
  });
});
