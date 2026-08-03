import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import {
  DOCUMENT_REPOSITORY,
  DOCUMENT_VERSION_REPOSITORY,
  STORAGE_PROVIDER,
  type DocumentRepository,
  type DocumentVersionRepository,
  type StorageProvider,
} from "../../../documents";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import type { ExtractedContent, ExtractedContentUnit } from "../../domain/extracted-content";
import { assertWithinCharacterLimit } from "../../domain/enforce-character-limit";
import { ExtractionChunk } from "../../domain/extraction-chunk.entity";
import { normalizeExtractedContent } from "../../domain/text-normalizer";
import {
  DocumentExtractionNotFoundError,
  FileTooLargeError,
  PageLimitExceededError,
  UnsupportedDocumentFormatError,
} from "../../domain/extraction-errors";
import { determineExtractionStrategy } from "../strategy/determine-extraction-strategy";
import { NATIVE_TEXT_EXTRACTOR, type NativeTextExtractor } from "../ports/native-text-extractor";
import { OCR_PROVIDER, type OcrProvider } from "../ports/ocr-provider";
import { OFFICE_DOCUMENT_EXTRACTOR, type OfficeDocumentExtractor } from "../ports/office-document-extractor";
import { PDF_INSPECTOR, type PdfInspector } from "../ports/pdf-inspector";
import { PDF_RASTERIZER, type PdfRasterizer } from "../ports/pdf-rasterizer";
import { SPREADSHEET_EXTRACTOR, type SpreadsheetExtractor } from "../ports/spreadsheet-extractor";
import type { StoredDocumentReference } from "../ports/stored-document-reference";
import { TEXT_SEGMENTER, type TextSegmenter } from "../ports/text-segmenter";
import { EXTRACTION_CONFIG, type ExtractionConfig } from "../../infrastructure/extraction-config";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";

export type ExtractDocumentContentCommand = Readonly<{
  organizationId: string;
  documentId: string;
  /** Indications de langue (mission Sprint 3 §9) — jamais une vérité absolue, seulement une aide à
   *  l'OCR ; contrairement à `ProcessDocumentExtractionUseCase` (module Extraction, lié à un
   *  Tender), l'appelant de ce contrat public choisit lui-même sa source d'indication (ex. la
   *  langue déjà déclarée d'une entrée de connaissance) — jamais résolue ici via un Tender. */
  languageHints?: readonly string[] | undefined;
}>;

export type ExtractedDocumentContentChunk = Readonly<{
  sequence: number;
  content: string;
  characterCount: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  checksum: string;
  tokenEstimate?: number | undefined;
}>;

export type ExtractDocumentContentResult =
  | {
      kind: "succeeded" | "partially_succeeded";
      language?: string | undefined;
      warnings: readonly string[];
      chunks: readonly ExtractedDocumentContentChunk[];
    }
  | { kind: "failed"; reason: string }
  | { kind: "not_processable" };

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

function decideOutcome(input: { characterCount: number; warnings: readonly string[]; minTextLength: number }): "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" {
  if (input.characterCount === 0) return "FAILED";
  if (input.characterCount < input.minTextLength) return "PARTIALLY_SUCCEEDED";
  return input.warnings.length > 0 ? "PARTIALLY_SUCCEEDED" : "SUCCEEDED";
}

/**
 * Contrat public d'extraction générique (mission Sprint 5 §6 "Créer un contrat public entre
 * Knowledge Base et Document Extraction") — extrait le texte/chunks d'UN document déjà stocké
 * (module Documents), SANS jamais exiger de Tender ni de DCE, contrairement à
 * `ProcessDocumentExtractionUseCase` (Sprint 3, intrinsèquement lié à un DCE : bookkeeping
 * `DceDocumentRepository`, indications de langue via `TenderRepository`, table `DocumentExtraction`
 * elle-même FK-ée à un `dceId` non nul). Réutilise EXACTEMENT les mêmes ports d'extraction
 * (PDF/OCR/Office/Tableur/Segmenteur) et la même configuration — mission §"Ne pas dupliquer...
 * parsing, extraction, OCR, chunking" : seule l'ORCHESTRATION (glue DCE-spécifique) diffère,
 * jamais le moteur lui-même. Ne persiste STRICTEMENT RIEN (ni dans les tables Extraction, ni
 * ailleurs) — retourne un résultat pur, à charge de l'appelant (Knowledge Base) de le persister
 * dans ses propres tables, jamais dans `DocumentExtraction`/`ExtractionChunk` (mission
 * §"Le module Knowledge Base ne doit pas accéder directement aux tables internes du module
 * Extraction").
 */
@Injectable()
export class ExtractDocumentContentUseCase {
  private readonly logger = new Logger(ExtractDocumentContentUseCase.name);

  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(PDF_INSPECTOR) private readonly pdfInspector: PdfInspector,
    @Inject(NATIVE_TEXT_EXTRACTOR) private readonly nativeTextExtractor: NativeTextExtractor,
    @Inject(PDF_RASTERIZER) private readonly pdfRasterizer: PdfRasterizer,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
    @Inject(OFFICE_DOCUMENT_EXTRACTOR) private readonly officeDocumentExtractor: OfficeDocumentExtractor,
    @Inject(SPREADSHEET_EXTRACTOR) private readonly spreadsheetExtractor: SpreadsheetExtractor,
    @Inject(TEXT_SEGMENTER) private readonly textSegmenter: TextSegmenter,
    @Inject(EXTRACTION_CONFIG) private readonly config: ExtractionConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ExtractDocumentContentCommand): Promise<ExtractDocumentContentResult> {
    let reference: StoredDocumentReference;
    try {
      reference = await this.resolveStoredDocumentReference(command.organizationId, command.documentId);
    } catch (error) {
      return this.toFailureOutcome(error);
    }

    if (reference.sizeBytes > this.config.extractionMaxFileSizeBytes) {
      return this.toFailureOutcome(new FileTooLargeError({ sizeBytes: reference.sizeBytes, maxBytes: this.config.extractionMaxFileSizeBytes }));
    }

    const languageHints = command.languageHints ?? [];

    let decision;
    try {
      const pdfInspection = reference.extension.toLowerCase() === "pdf" ? await this.pdfInspector.inspect(reference) : undefined;
      if (pdfInspection && pdfInspection.pageCount > this.config.extractionMaxPages) {
        throw new PageLimitExceededError({ pageCount: pdfInspection.pageCount, maxPages: this.config.extractionMaxPages });
      }
      decision = determineExtractionStrategy(reference, pdfInspection);
    } catch (error) {
      return this.toFailureOutcome(error);
    }

    if (decision.strategy === DocumentExtractionStrategy.Unsupported) {
      return { kind: "not_processable" };
    }

    try {
      const { content, language } = await this.runExtraction(decision.strategy, reference, languageHints);
      assertWithinCharacterLimit(content, this.config.extractionMaxCharacters);

      const normalized = normalizeExtractedContent(content);
      const chunkDrafts = await this.textSegmenter.segment(normalized, {
        maxChunkCharacters: this.config.extractionChunkSize,
        overlapCharacters: this.config.extractionChunkOverlap,
      });

      const finishedAt = this.clock.now();
      const chunks = chunkDrafts.map((draft, index) =>
        ExtractionChunk.create({
          id: randomUUID(),
          documentId: command.documentId,
          organizationId: command.organizationId,
          sequence: index,
          pageStart: draft.pageStart,
          pageEnd: draft.pageEnd,
          sheetName: draft.sheetName,
          sectionTitle: draft.sectionTitle,
          content: draft.content,
          tokenEstimate: draft.tokenEstimate,
          occurredAt: finishedAt,
        }),
      );

      const characterCount = normalized.units.reduce((sum, unit) => sum + unit.text.length, 0);
      const warnings = [...content.warnings];
      const decided = decideOutcome({ characterCount, warnings, minTextLength: this.config.extractionMinTextLength });

      if (decided === "FAILED") {
        return this.toFailureOutcome(new Error("extraction produced no usable text content"));
      }

      return {
        kind: decided === "SUCCEEDED" ? "succeeded" : "partially_succeeded",
        language,
        warnings,
        chunks: chunks.map((chunk) => ({
          sequence: chunk.sequence,
          content: chunk.content,
          characterCount: chunk.characterCount,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sheetName: chunk.sheetName,
          sectionTitle: chunk.sectionTitle,
          checksum: chunk.checksum,
          tokenEstimate: chunk.tokenEstimate,
        })),
      };
    } catch (error) {
      return this.toFailureOutcome(error);
    }
  }

  private toFailureOutcome(error: unknown): ExtractDocumentContentResult {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Document content extraction failed: ${reason}`);
    return { kind: "failed", reason };
  }

  private async resolveStoredDocumentReference(organizationId: string, documentId: string): Promise<StoredDocumentReference> {
    const document = await this.documentRepository.findById({ organizationId, documentId });
    if (!document || !document.currentVersionId) {
      throw new DocumentExtractionNotFoundError();
    }
    const version = await this.documentVersionRepository.findById({ organizationId, documentId, versionId: document.currentVersionId });
    if (!version) {
      throw new DocumentExtractionNotFoundError();
    }
    return {
      organizationId,
      documentId,
      storageKey: version.storageKey,
      mimeType: version.mimeType,
      extension: version.extension,
      sizeBytes: version.sizeBytes,
    };
  }

  private async runExtraction(
    strategy: DocumentExtractionStrategy,
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{ content: ExtractedContent; language?: string | undefined }> {
    switch (strategy) {
      case DocumentExtractionStrategy.NativeText:
        return this.runNativeTextExtraction(reference, languageHints);
      case DocumentExtractionStrategy.Ocr:
        return this.runOcrExtraction(reference, languageHints);
      case DocumentExtractionStrategy.OfficeDocument:
        return { content: await this.runOfficeExtraction(reference) };
      case DocumentExtractionStrategy.Spreadsheet:
        return { content: await this.runSpreadsheetExtraction(reference) };
      case DocumentExtractionStrategy.Unsupported:
      default:
        throw new UnsupportedDocumentFormatError({ extension: reference.extension });
    }
  }

  private async runNativeTextExtraction(
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{ content: ExtractedContent; language?: string | undefined }> {
    const nativeResult = await this.nativeTextExtractor.extract(reference);
    const pageTexts = new Map(nativeResult.pages.map((page) => [page.pageNumber, page.text]));
    const warnings = [...nativeResult.warnings];
    const emptyPageNumbers = nativeResult.pages.filter((page) => page.text.trim().length === 0).map((page) => page.pageNumber);

    if (emptyPageNumbers.length > 0 && emptyPageNumbers.length < nativeResult.pages.length) {
      try {
        const rasterized = await this.pdfRasterizer.rasterizePages({ ...reference, pageNumbers: emptyPageNumbers });
        for (const page of rasterized) {
          const ocrResult = await this.ocrProvider.extract({ imageBuffer: page.imageBuffer, mimeType: page.mimeType, languageHints });
          pageTexts.set(page.pageNumber, ocrResult.text);
          warnings.push(`page ${page.pageNumber} recovered via targeted OCR (native text was empty)`);
        }
      } catch (error) {
        warnings.push(`targeted OCR for scanned pages failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const units: ExtractedContentUnit[] = nativeResult.pages.map((page) => ({ kind: "page", index: page.pageNumber, text: pageTexts.get(page.pageNumber) ?? page.text }));

    return { content: { documentId: reference.documentId, strategy: DocumentExtractionStrategy.NativeText, units, warnings } };
  }

  private async runOcrExtraction(
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{ content: ExtractedContent; language?: string | undefined }> {
    const warnings: string[] = [];
    let detectedLanguage: string | undefined;
    const units: ExtractedContentUnit[] = [];

    if (IMAGE_MIME_TYPES.has(reference.mimeType) || reference.extension.toLowerCase() !== "pdf") {
      const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(reference.storageKey));
      const result = await this.ocrProvider.extract({ imageBuffer: buffer, mimeType: reference.mimeType, languageHints });
      units.push({ kind: "page", index: 1, text: result.text });
      warnings.push(...result.warnings);
      detectedLanguage = result.detectedLanguage;
    } else {
      const inspection = await this.pdfInspector.inspect(reference);
      const pageNumbers = Array.from({ length: inspection.pageCount }, (_, index) => index + 1);
      const rasterized = await this.pdfRasterizer.rasterizePages({ ...reference, pageNumbers });
      let runningCharacterCount = 0;
      for (const page of rasterized) {
        const result = await this.ocrProvider.extract({ imageBuffer: page.imageBuffer, mimeType: page.mimeType, languageHints });
        units.push({ kind: "page", index: page.pageNumber, text: result.text });
        warnings.push(...result.warnings);
        detectedLanguage = detectedLanguage ?? result.detectedLanguage;
        runningCharacterCount += result.text.length;
        if (runningCharacterCount > this.config.extractionMaxCharacters) {
          warnings.push(`OCR stopped early after page ${page.pageNumber}: character limit (${this.config.extractionMaxCharacters}) already exceeded`);
          break;
        }
      }
    }

    return { content: { documentId: reference.documentId, strategy: DocumentExtractionStrategy.Ocr, units, warnings }, language: detectedLanguage };
  }

  private async runOfficeExtraction(reference: StoredDocumentReference): Promise<ExtractedContent> {
    const result = await this.officeDocumentExtractor.extract(reference);
    let sectionIndex = 0;
    let sectionLabel: string | undefined;
    const units: ExtractedContentUnit[] = result.elements.map((element) => {
      if (element.kind === "heading") {
        sectionIndex += 1;
        sectionLabel = element.text;
        return { kind: "section", index: sectionIndex, label: sectionLabel, text: "" };
      }
      return { kind: "section", index: sectionIndex, label: sectionLabel, text: element.text };
    });
    return { documentId: reference.documentId, strategy: DocumentExtractionStrategy.OfficeDocument, units, warnings: result.warnings };
  }

  private async runSpreadsheetExtraction(reference: StoredDocumentReference): Promise<ExtractedContent> {
    const result = await this.spreadsheetExtractor.extract(reference);
    const units: ExtractedContentUnit[] = result.sheets.map((sheet, index) => ({ kind: "sheet", index, label: sheet.name, text: sheet.text }));
    return { documentId: reference.documentId, strategy: DocumentExtractionStrategy.Spreadsheet, units, warnings: result.warnings };
  }
}
