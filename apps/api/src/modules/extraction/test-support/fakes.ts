import { Readable } from "node:stream";
import type { Clock } from "../../../shared-kernel/clock";
import type { StorageProvider } from "../../documents";
import { DocumentExtraction } from "../domain/document-extraction.aggregate";
import { DocumentExtractionStatus } from "../domain/document-extraction-status";
import { ExtractionAttempt } from "../domain/extraction-attempt.entity";
import { ExtractionChunk } from "../domain/extraction-chunk.entity";
import { DocumentExtractionNotFoundError } from "../domain/extraction-errors";
import type { AuditLogWriter, ExtractionAuditLogEntry } from "../application/ports/audit-log-writer";
import type {
  DocumentExtractionRepository,
  ExclusiveExtractionContext,
  FinalizeAttemptOutcome,
  ReservationOutcome,
} from "../application/ports/document-extraction.repository";
import type { ExtractionAttemptRepository } from "../application/ports/extraction-attempt.repository";
import type { ExtractionChunkRepository } from "../application/ports/extraction-chunk.repository";
import type { ExtractionDispatchInput, ExtractionDispatcher } from "../application/ports/extraction-dispatcher";
import type { NativeExtractionResult, NativeTextExtractor } from "../application/ports/native-text-extractor";
import type { OcrInput, OcrProvider, OcrResult } from "../application/ports/ocr-provider";
import type { OfficeDocumentExtractor, OfficeExtractionResult } from "../application/ports/office-document-extractor";
import type { PdfInspectionResult, PdfInspector } from "../application/ports/pdf-inspector";
import type { PdfRasterizer, RasterizedPage } from "../application/ports/pdf-rasterizer";
import type { SpreadsheetExtractionResult, SpreadsheetExtractor } from "../application/ports/spreadsheet-extractor";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";

export const FIXED_NOW = new Date("2026-07-27T14:00:00Z");

export class FixedClock implements Clock {
  constructor(private readonly value: Date = FIXED_NOW) {}

  now(): Date {
    return this.value;
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: ExtractionAuditLogEntry[] = [];

  async record(entry: ExtractionAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

/** Ne simule aucun verrou réel (mono-thread, pas de concurrence possible en mémoire) — suffisant
 *  pour les tests unitaires de logique métier, jamais pour prouver l'absence de race condition
 *  (voir l'intégration PostgreSQL dédiée, même motif que InMemoryDceDocumentRepository).
 *  Reproduit néanmoins la sémantique de compare-and-set de `reserveForProcessing`/
 *  `finalizeAttempt` (correction P1-02) : une finalisation dont `expectedAttemptCount` ne
 *  correspond plus à l'état courant est bien rejetée (`applied: false`), même en mémoire. */
export class InMemoryDocumentExtractionRepository implements DocumentExtractionRepository {
  private readonly byDocumentId = new Map<string, DocumentExtraction>();

  constructor(private readonly chunkStore: InMemoryExtractionChunkRepository = new InMemoryExtractionChunkRepository()) {}

  async findByDocumentId(input: { organizationId: string; documentId: string }): Promise<DocumentExtraction | null> {
    const extraction = this.byDocumentId.get(input.documentId);
    if (!extraction || extraction.organizationId !== input.organizationId) {
      return null;
    }
    return extraction;
  }

  async create(extraction: DocumentExtraction): Promise<void> {
    this.byDocumentId.set(extraction.documentId, extraction);
  }

  async save(extraction: DocumentExtraction): Promise<void> {
    this.byDocumentId.set(extraction.documentId, extraction);
  }

  async reserveForProcessing(input: {
    organizationId: string;
    documentId: string;
    occurredAt: Date;
  }): Promise<ReservationOutcome> {
    const extraction = await this.findByDocumentId(input);
    if (!extraction) {
      throw new DocumentExtractionNotFoundError();
    }
    if (extraction.status !== DocumentExtractionStatus.Pending && extraction.status !== DocumentExtractionStatus.Ready) {
      return { kind: "not_startable", status: extraction.status };
    }
    extraction.reserve(input.occurredAt);
    await this.save(extraction);
    return { kind: "reserved", extraction };
  }

  async finalizeAttempt(input: {
    organizationId: string;
    documentId: string;
    expectedAttemptCount: number;
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
  }): Promise<{ applied: boolean }> {
    const extraction = await this.findByDocumentId(input);
    if (
      !extraction ||
      extraction.attemptCount !== input.expectedAttemptCount ||
      extraction.status !== DocumentExtractionStatus.Processing
    ) {
      return { applied: false };
    }

    if (input.outcome.kind === "not_processable") {
      extraction.markNotProcessable(input.occurredAt);
    } else if (input.outcome.kind === "failed") {
      extraction.fail({ reason: input.outcome.reason, strategy: input.outcome.strategy }, input.occurredAt);
    } else {
      extraction.complete(
        {
          outcome: input.outcome.kind === "succeeded" ? DocumentExtractionStatus.Succeeded : DocumentExtractionStatus.PartiallySucceeded,
          strategy: input.outcome.strategy,
          pageCount: input.outcome.pageCount,
          characterCount: input.outcome.characterCount,
          chunkCount: input.outcome.chunkCount,
          language: input.outcome.language,
          warnings: input.outcome.warnings,
          contentChecksum: input.outcome.contentChecksum,
        },
        input.occurredAt,
      );
      await this.chunkStore.replaceChunks({
        organizationId: input.organizationId,
        documentId: input.documentId,
        chunks: input.outcome.chunks,
      });
    }

    await this.save(extraction);
    return { applied: true };
  }

  async runExclusiveShort<T>(input: {
    documentId: string;
    fn: (context: ExclusiveExtractionContext) => Promise<T>;
  }): Promise<T> {
    const context: ExclusiveExtractionContext = {
      findByDocumentId: (query) => this.findByDocumentId(query),
      save: (extraction) => this.save(extraction),
    };
    return input.fn(context);
  }
}

export class InMemoryExtractionAttemptRepository implements ExtractionAttemptRepository {
  readonly attempts: ExtractionAttempt[] = [];

  async create(attempt: ExtractionAttempt): Promise<void> {
    this.attempts.push(attempt);
  }

  async listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionAttempt[]> {
    return this.attempts.filter(
      (attempt) => attempt.organizationId === input.organizationId && attempt.documentId === input.documentId,
    );
  }
}

export class InMemoryExtractionChunkRepository implements ExtractionChunkRepository {
  private chunks: ExtractionChunk[] = [];

  async replaceChunks(input: {
    organizationId: string;
    documentId: string;
    chunks: readonly ExtractionChunk[];
  }): Promise<void> {
    this.chunks = this.chunks.filter(
      (chunk) => !(chunk.organizationId === input.organizationId && chunk.documentId === input.documentId),
    );
    this.chunks.push(...input.chunks);
  }

  async listByDocumentId(input: { organizationId: string; documentId: string }): Promise<ExtractionChunk[]> {
    return this.chunks
      .filter((chunk) => chunk.organizationId === input.organizationId && chunk.documentId === input.documentId)
      .sort((a, b) => a.sequence - b.sequence);
  }

  async countByDocumentId(input: { organizationId: string; documentId: string }): Promise<number> {
    return (await this.listByDocumentId(input)).length;
  }
}

export class RecordingExtractionDispatcher implements ExtractionDispatcher {
  readonly dispatched: ExtractionDispatchInput[] = [];

  dispatch(input: ExtractionDispatchInput): void {
    this.dispatched.push(input);
  }
}

/** Stocke un unique buffer par clé, en mémoire — suffisant pour tester les adaptateurs
 *  d'extraction (PdfParseInspector, MammothOfficeDocumentExtractor, XlsxSpreadsheetExtractor)
 *  sans dépendre du système de fichiers ni du réseau. */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, Buffer>();

  seed(key: string, content: Buffer): void {
    this.objects.set(key, content);
  }

  async put(input: { key: string; content: Readable; contentType: string; sizeBytes: number }): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    this.objects.set(input.key, Buffer.concat(chunks));
  }

  async openReadStream(key: string): Promise<Readable> {
    const content = this.objects.get(key);
    if (!content) throw new Error(`No object at key "${key}"`);
    return Readable.from(content);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async getMetadata(key: string): Promise<{ sizeBytes: number; contentType: string } | null> {
    const content = this.objects.get(key);
    return content ? { sizeBytes: content.length, contentType: "application/octet-stream" } : null;
  }
}

export class FakePdfInspector implements PdfInspector {
  constructor(private readonly result: PdfInspectionResult) {}

  async inspect(_input: StoredDocumentReference): Promise<PdfInspectionResult> {
    return this.result;
  }
}

export class FakeNativeTextExtractor implements NativeTextExtractor {
  constructor(private readonly result: NativeExtractionResult) {}

  async extract(_input: StoredDocumentReference): Promise<NativeExtractionResult> {
    return this.result;
  }
}

export class FakePdfRasterizer implements PdfRasterizer {
  constructor(private readonly imageByPage: ReadonlyMap<number, Buffer> = new Map()) {}

  async rasterizePages(
    input: StoredDocumentReference & { pageNumbers: readonly number[] },
  ): Promise<RasterizedPage[]> {
    return input.pageNumbers.map((pageNumber) => ({
      pageNumber,
      imageBuffer: this.imageByPage.get(pageNumber) ?? Buffer.from(`page-${pageNumber}`),
      mimeType: "image/png",
    }));
  }
}

export class FakeOcrProvider implements OcrProvider {
  readonly calls: OcrInput[] = [];

  constructor(
    private readonly result: OcrResult = {
      text: "ocr text",
      durationMs: 1,
      provider: "fake-ocr",
      warnings: [],
    },
  ) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    this.calls.push(input);
    return this.result;
  }
}

export class FakeOfficeDocumentExtractor implements OfficeDocumentExtractor {
  constructor(private readonly result: OfficeExtractionResult) {}

  async extract(_input: StoredDocumentReference): Promise<OfficeExtractionResult> {
    return this.result;
  }
}

export class FakeSpreadsheetExtractor implements SpreadsheetExtractor {
  constructor(private readonly result: SpreadsheetExtractionResult) {}

  async extract(_input: StoredDocumentReference): Promise<SpreadsheetExtractionResult> {
    return this.result;
  }
}
