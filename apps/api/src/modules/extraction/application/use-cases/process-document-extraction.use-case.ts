import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import {
  DCE_DOCUMENT_REPOSITORY,
  DceDocumentProcessingStatus,
  type DceDocumentRepository,
} from "../../../dce";
import {
  DOCUMENT_REPOSITORY,
  DOCUMENT_VERSION_REPOSITORY,
  STORAGE_PROVIDER,
  type DocumentRepository,
  type DocumentVersionRepository,
  type StorageProvider,
} from "../../../documents";
import { TENDER_REPOSITORY, type TenderRepository } from "../../../tenders";
import { DocumentExtractionStrategy } from "../../domain/document-extraction-strategy";
import type { ExtractedContent, ExtractedContentUnit } from "../../domain/extracted-content";
import { ExtractionAttempt } from "../../domain/extraction-attempt.entity";
import { ExtractionChunk } from "../../domain/extraction-chunk.entity";
import { assertWithinCharacterLimit } from "../../domain/enforce-character-limit";
import { normalizeExtractedContent } from "../../domain/text-normalizer";
import {
  CorruptedDocumentError,
  DocumentExtractionNotFoundError,
  EncryptedPdfError,
  FileTooLargeError,
  PageLimitExceededError,
  UnsupportedDocumentFormatError,
} from "../../domain/extraction-errors";
import { determineExtractionStrategy } from "../strategy/determine-extraction-strategy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import {
  DOCUMENT_EXTRACTION_REPOSITORY,
  type DocumentExtractionRepository,
  type FinalizeAttemptOutcome,
} from "../ports/document-extraction.repository";
import { EXTRACTION_ATTEMPT_REPOSITORY, type ExtractionAttemptRepository } from "../ports/extraction-attempt.repository";
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

export type ProcessDocumentExtractionCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  dceId: string;
  documentId: string;
  requestId?: string | undefined;
}>;

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

function decideOutcome(input: {
  characterCount: number;
  warnings: readonly string[];
  minTextLength: number;
}): "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "FAILED" {
  if (input.characterCount === 0) {
    return "FAILED";
  }
  if (input.characterCount < input.minTextLength) {
    return "PARTIALLY_SUCCEEDED";
  }
  return input.warnings.length > 0 ? "PARTIALLY_SUCCEEDED" : "SUCCEEDED";
}

/**
 * Orchestrateur du pipeline d'extraction (mission Sprint 3, corrigé P1-02/P1-03) — jamais appelé
 * directement par un contrôleur HTTP (voir ExtractionDispatcher) : ce use case porte la logique de
 * traitement, déclenchée en tâche de fond après qu'une requête HTTP a créé/validé le
 * `DocumentExtraction`.
 *
 * Exécution en 3 phases distinctes (correction P1-02 — plus jamais une transaction Prisma qui
 * tient tout le pipeline) :
 * 1. `reserveForProcessing` — réservation atomique COURTE (verrou consultatif + compare-and-set
 *    de statut), empêche tout double démarrage.
 * 2. `runPhase2` — TOUT le travail réel (lecture du fichier, inspection, détection de stratégie,
 *    extraction native/OCR/Office/tableur, normalisation, segmentation) EXÉCUTÉ HORS TRANSACTION.
 * 3. `finalizeAttempt` — finalisation atomique COURTE, avec compare-and-set sur `attemptCount`
 *    (jamais un résultat obsolète n'écrase un résultat plus récent).
 *
 * Le bookkeeping annexe (historique des tentatives, miroir DceDocument, audit log) reste HORS de
 * toute transaction, exécuté après la Phase 3 — best-effort, jamais une cause de rollback du
 * résultat métier déjà acquis.
 */
@Injectable()
export class ProcessDocumentExtractionUseCase {
  private readonly logger = new Logger(ProcessDocumentExtractionUseCase.name);

  constructor(
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(EXTRACTION_ATTEMPT_REPOSITORY) private readonly attemptRepository: ExtractionAttemptRepository,
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    @Inject(PDF_INSPECTOR) private readonly pdfInspector: PdfInspector,
    @Inject(NATIVE_TEXT_EXTRACTOR) private readonly nativeTextExtractor: NativeTextExtractor,
    @Inject(PDF_RASTERIZER) private readonly pdfRasterizer: PdfRasterizer,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
    @Inject(OFFICE_DOCUMENT_EXTRACTOR) private readonly officeDocumentExtractor: OfficeDocumentExtractor,
    @Inject(SPREADSHEET_EXTRACTOR) private readonly spreadsheetExtractor: SpreadsheetExtractor,
    @Inject(TEXT_SEGMENTER) private readonly textSegmenter: TextSegmenter,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(EXTRACTION_CONFIG) private readonly config: ExtractionConfig,
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ProcessDocumentExtractionCommand): Promise<void> {
    const reservedAt = this.clock.now();
    const reservation = await this.extractionRepository.reserveForProcessing({
      organizationId: command.organizationId,
      documentId: command.documentId,
      occurredAt: reservedAt,
    });

    if (reservation.kind === "not_startable") {
      this.logger.warn(
        `Skipping extraction for document ${command.documentId}: status is ${reservation.status}, not startable.`,
      );
      return;
    }

    const { extraction } = reservation;
    const startedAt = reservedAt;

    // Phase 2 — intégralement hors transaction (correction P1-02).
    const outcome = await this.runPhase2(command);

    // Phase 3 — finalisation atomique courte, compare-and-set sur attemptCount.
    const finalizeResult = await this.extractionRepository.finalizeAttempt({
      organizationId: command.organizationId,
      documentId: command.documentId,
      expectedAttemptCount: extraction.attemptCount,
      occurredAt: this.clock.now(),
      outcome,
    });

    if (!finalizeResult.applied) {
      this.logger.warn(
        `Finalization for document ${command.documentId} discarded: the reservation (attempt ` +
          `${extraction.attemptCount}) is no longer current — a more recent attempt has since started.`,
      );
      return;
    }

    await this.recordBookkeeping(command, outcome, extraction.attemptCount, startedAt, this.clock.now());
  }

  /** Toute cette méthode s'exécute HORS transaction Prisma (correction P1-02) : lecture du
   *  fichier, inspection, détection de stratégie, extraction, normalisation, segmentation. Ne
   *  touche jamais la base — retourne un résultat pur, appliqué ensuite par `finalizeAttempt`. */
  private async runPhase2(command: ProcessDocumentExtractionCommand): Promise<FinalizeAttemptOutcome> {
    let reference: StoredDocumentReference;
    try {
      reference = await this.resolveStoredDocumentReference(command.organizationId, command.documentId);
    } catch (error) {
      return this.toFailureOutcome(error, undefined);
    }

    // Correction P1-03 — la taille est déjà connue via les métadonnées de DocumentVersion,
    // jamais besoin d'ouvrir le fichier pour ce premier filet de sécurité.
    if (reference.sizeBytes > this.config.extractionMaxFileSizeBytes) {
      return this.toFailureOutcome(
        new FileTooLargeError({ sizeBytes: reference.sizeBytes, maxBytes: this.config.extractionMaxFileSizeBytes }),
        undefined,
      );
    }

    const languageHints = await this.resolveLanguageHints(command.organizationId, command.tenderId);

    let decision;
    try {
      const pdfInspection =
        reference.extension.toLowerCase() === "pdf" ? await this.pdfInspector.inspect(reference) : undefined;
      // Correction P1-03 — refusé AVANT toute rasterisation/extraction, jamais après avoir
      // traité une partie du document.
      if (pdfInspection && pdfInspection.pageCount > this.config.extractionMaxPages) {
        throw new PageLimitExceededError({
          pageCount: pdfInspection.pageCount,
          maxPages: this.config.extractionMaxPages,
        });
      }
      decision = determineExtractionStrategy(reference, pdfInspection);
    } catch (error) {
      return this.toFailureOutcome(error, undefined);
    }

    if (decision.strategy === DocumentExtractionStrategy.Unsupported) {
      return { kind: "not_processable" };
    }

    try {
      const { content, language, pageCount, provider } = await this.runExtraction(
        decision.strategy,
        reference,
        languageHints,
      );
      // Correction P1-03 — arrête proprement avant de normaliser/segmenter un contenu déjà trop
      // volumineux.
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
        return this.toFailureOutcome(
          new Error("extraction produced no usable text content"),
          decision.strategy,
        );
      }

      const contentChecksum = chunks.length > 0 ? chunks[0]!.checksum : undefined;
      return {
        kind: decided === "SUCCEEDED" ? "succeeded" : "partially_succeeded",
        strategy: decision.strategy,
        provider,
        pageCount,
        characterCount,
        chunkCount: chunks.length,
        language,
        warnings,
        contentChecksum,
        // Correctif audit Codex round 2 P1 (Chat IA conversationnel) — la version RÉELLEMENT lue
        // pour produire ces chunks (`reference`, résolue au tout début de cette phase), jamais
        // relue depuis `Document.currentVersionId` au moment de la finalisation.
        documentVersionId: reference.documentVersionId,
        chunks,
      };
    } catch (error) {
      return this.toFailureOutcome(error, decision.strategy);
    }
  }

  private toFailureOutcome(error: unknown, strategy: DocumentExtractionStrategy | undefined): FinalizeAttemptOutcome {
    const reason = error instanceof Error ? error.message : String(error);
    this.logger.error(`Extraction failed: ${reason}`);
    return { kind: "failed", strategy, reason };
  }

  /**
   * Bookkeeping annexe (mission §14) — historique des tentatives, miroir DceDocument, audit log.
   * Exécuté HORS transaction, une fois la Phase 3 acquise : jamais une cause de rollback du
   * résultat métier déjà acquis, seulement journalisé en cas d'échec.
   */
  private async recordBookkeeping(
    command: ProcessDocumentExtractionCommand,
    outcome: FinalizeAttemptOutcome,
    attemptNumber: number,
    startedAt: Date,
    finishedAt: Date,
  ): Promise<void> {
    if (outcome.kind === "not_processable") {
      return;
    }

    try {
      if (outcome.kind === "failed") {
        // Jamais une stratégie fictive : si l'échec est survenu avant que la stratégie ne soit
        // connue (ex. fichier introuvable, taille/pages déjà refusées), aucune ligne d'historique
        // de tentative n'est créée — seul l'audit log conserve la trace de cet échec précoce.
        if (outcome.strategy) {
          await this.attemptRepository.create(
            ExtractionAttempt.create({
              id: randomUUID(),
              documentId: command.documentId,
              organizationId: command.organizationId,
              attemptNumber,
              strategy: outcome.strategy,
              outcome: "FAILED",
              startedAt,
              finishedAt,
              durationMs: finishedAt.getTime() - startedAt.getTime(),
              warnings: [],
              errorMessage: outcome.reason,
            }),
          );
        }

        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "SYSTEM",
          action: "extraction.failed",
          resourceType: "document_extraction",
          resourceId: command.documentId,
          requestId: command.requestId,
          metadata: { reason: outcome.reason },
        });
      } else {
        await this.attemptRepository.create(
          ExtractionAttempt.create({
            id: randomUUID(),
            documentId: command.documentId,
            organizationId: command.organizationId,
            attemptNumber,
            strategy: outcome.strategy,
            outcome: outcome.kind === "succeeded" ? "SUCCEEDED" : "PARTIALLY_SUCCEEDED",
            provider: outcome.provider,
            startedAt,
            finishedAt,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            characterCount: outcome.characterCount,
            chunkCount: outcome.chunkCount,
            language: outcome.language,
            warnings: outcome.warnings,
          }),
        );

        await this.dceDocumentRepository.updateProcessingStatus({
          organizationId: command.organizationId,
          dceId: command.dceId,
          documentId: command.documentId,
          processingStatus:
            outcome.kind === "succeeded"
              ? DceDocumentProcessingStatus.ReadyForAnalysis
              : DceDocumentProcessingStatus.ReadyForAnalysisWithWarnings,
          updatedAt: finishedAt,
        });

        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "SYSTEM",
          action: "extraction.completed",
          resourceType: "document_extraction",
          resourceId: command.documentId,
          requestId: command.requestId,
          metadata: {
            strategy: outcome.strategy,
            outcome: outcome.kind,
            chunkCount: outcome.chunkCount,
            characterCount: outcome.characterCount,
          },
        });
      }
    } catch (bookkeepingError) {
      this.logger.error(
        `Extraction ${command.documentId} reached a final state (${outcome.kind}) but post-completion ` +
          `bookkeeping (attempt/DCE mirror/audit) failed: ` +
          `${bookkeepingError instanceof Error ? bookkeepingError.message : String(bookkeepingError)}`,
      );
    }
  }

  private async resolveStoredDocumentReference(
    organizationId: string,
    documentId: string,
  ): Promise<StoredDocumentReference> {
    const document = await this.documentRepository.findById({ organizationId, documentId });
    if (!document || !document.currentVersionId) {
      throw new DocumentExtractionNotFoundError();
    }
    const version = await this.documentVersionRepository.findById({
      organizationId,
      documentId,
      versionId: document.currentVersionId,
    });
    if (!version) {
      throw new DocumentExtractionNotFoundError();
    }
    return {
      organizationId,
      documentId,
      documentVersionId: document.currentVersionId,
      storageKey: version.storageKey,
      mimeType: version.mimeType,
      extension: version.extension,
      sizeBytes: version.sizeBytes,
    };
  }

  /** Mission §9 — la langue du Tender n'est qu'une INDICATION, jamais une vérité absolue : la
   *  langue réellement détectée par l'OCR (si disponible) prévaut toujours (voir runOcrExtraction,
   *  `detectedLanguage`). Lecture directe du port `TenderRepository` (jamais `GetTenderUseCase`,
   *  RBAC-gated) : une opération système interne ne doit jamais dépendre d'un rôle d'acteur qui
   *  n'existe pas dans ce contexte de traitement en tâche de fond. */
  private async resolveLanguageHints(organizationId: string, tenderId: string): Promise<string[]> {
    const tender = await this.tenderRepository.findById({ organizationId, tenderId });
    return tender?.language ? [tender.language] : [];
  }

  private async runExtraction(
    strategy: DocumentExtractionStrategy,
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{
    content: ExtractedContent;
    language?: string | undefined;
    pageCount?: number | undefined;
    provider?: string | undefined;
  }> {
    switch (strategy) {
      case DocumentExtractionStrategy.NativeText:
        return this.runNativeTextExtraction(reference, languageHints);
      case DocumentExtractionStrategy.Ocr:
        return this.runOcrExtraction(reference, languageHints);
      case DocumentExtractionStrategy.OfficeDocument:
        return this.runOfficeExtraction(reference);
      case DocumentExtractionStrategy.Spreadsheet:
        return this.runSpreadsheetExtraction(reference);
      case DocumentExtractionStrategy.Unsupported:
      default:
        throw new UnsupportedDocumentFormatError({ extension: reference.extension });
    }
  }

  /** PDF mixte (mission §7) : texte natif comme source principale, complété par un OCR ciblé des
   *  seules pages dont le texte natif est vide — jamais un OCR systématique de tout le document. */
  private async runNativeTextExtraction(
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{
    content: ExtractedContent;
    language?: string | undefined;
    pageCount?: number | undefined;
    provider?: string | undefined;
  }> {
    const nativeResult = await this.nativeTextExtractor.extract(reference);
    const pageTexts = new Map(nativeResult.pages.map((page) => [page.pageNumber, page.text]));
    const warnings = [...nativeResult.warnings];
    const emptyPageNumbers = nativeResult.pages.filter((page) => page.text.trim().length === 0).map((page) => page.pageNumber);

    if (emptyPageNumbers.length > 0 && emptyPageNumbers.length < nativeResult.pages.length) {
      try {
        const rasterized = await this.pdfRasterizer.rasterizePages({ ...reference, pageNumbers: emptyPageNumbers });
        for (const page of rasterized) {
          const ocrResult = await this.ocrProvider.extract({
            imageBuffer: page.imageBuffer,
            mimeType: page.mimeType,
            languageHints,
          });
          pageTexts.set(page.pageNumber, ocrResult.text);
          warnings.push(`page ${page.pageNumber} recovered via targeted OCR (native text was empty)`);
        }
      } catch (error) {
        warnings.push(
          `targeted OCR for scanned pages failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const units: ExtractedContentUnit[] = nativeResult.pages.map((page) => ({
      kind: "page",
      index: page.pageNumber,
      text: pageTexts.get(page.pageNumber) ?? page.text,
    }));

    return {
      content: { documentId: reference.documentId, strategy: DocumentExtractionStrategy.NativeText, units, warnings },
      pageCount: nativeResult.pages.length,
      provider: "pdf-parse",
    };
  }

  private async runOcrExtraction(
    reference: StoredDocumentReference,
    languageHints: readonly string[],
  ): Promise<{
    content: ExtractedContent;
    language?: string | undefined;
    pageCount?: number | undefined;
    provider?: string | undefined;
  }> {
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
      // Correction P1-03 — le nombre de pages est déjà borné par `extractionMaxPages` avant
      // d'atteindre ce point (voir `runPhase2`) : jamais une rasterisation complète non bornée.
      const pageNumbers = Array.from({ length: inspection.pageCount }, (_, index) => index + 1);
      const rasterized = await this.pdfRasterizer.rasterizePages({ ...reference, pageNumbers });
      let runningCharacterCount = 0;
      for (const page of rasterized) {
        const result = await this.ocrProvider.extract({
          imageBuffer: page.imageBuffer,
          mimeType: page.mimeType,
          languageHints,
        });
        units.push({ kind: "page", index: page.pageNumber, text: result.text });
        warnings.push(...result.warnings);
        detectedLanguage = detectedLanguage ?? result.detectedLanguage;
        runningCharacterCount += result.text.length;
        // Correction P1-03 — arrêt incrémental : jamais d'appel OCR gaspillé sur les pages
        // restantes une fois la limite déjà dépassée (le contrôle définitif reste
        // `assertWithinCharacterLimit`, appelé par l'appelant sur le contenu complet).
        if (runningCharacterCount > this.config.extractionMaxCharacters) {
          warnings.push(
            `OCR stopped early after page ${page.pageNumber}: character limit ` +
              `(${this.config.extractionMaxCharacters}) already exceeded`,
          );
          break;
        }
      }
    }

    return {
      content: { documentId: reference.documentId, strategy: DocumentExtractionStrategy.Ocr, units, warnings },
      language: detectedLanguage,
      pageCount: units.length,
      provider: "tesseract.js",
    };
  }

  /** Regroupe chaque élément sous le titre qui le précède (mission §10 "ordre documentaire",
   *  mission §13 "jamais fusionner deux sections différentes") : `index`/`label` restent stables
   *  pour tous les éléments d'une même section, et ne changent qu'au titre suivant — c'est ce qui
   *  permet au segmenteur (`boundaryKey`) de regrouper les paragraphes d'une section tout en
   *  forçant une coupure à chaque nouveau titre. */
  private async runOfficeExtraction(
    reference: StoredDocumentReference,
  ): Promise<{ content: ExtractedContent; provider?: string | undefined }> {
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
    return {
      content: {
        documentId: reference.documentId,
        strategy: DocumentExtractionStrategy.OfficeDocument,
        units,
        warnings: result.warnings,
      },
      provider: "mammoth",
    };
  }

  private async runSpreadsheetExtraction(
    reference: StoredDocumentReference,
  ): Promise<{ content: ExtractedContent; provider?: string | undefined }> {
    const result = await this.spreadsheetExtractor.extract(reference);
    const units: ExtractedContentUnit[] = result.sheets.map((sheet, index) => ({
      kind: "sheet",
      index,
      label: sheet.name,
      text: sheet.text,
    }));
    return {
      content: {
        documentId: reference.documentId,
        strategy: DocumentExtractionStrategy.Spreadsheet,
        units,
        warnings: result.warnings,
      },
      provider: "xlsx",
    };
  }
}

// Ré-exports pour les tests unitaires (mission §19) — jamais utilisés par le code applicatif.
export { CorruptedDocumentError, EncryptedPdfError };
