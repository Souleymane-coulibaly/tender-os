import { Module } from "@nestjs/common";
import { DceModule } from "../dce";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { TendersModule } from "../tenders";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { DOCUMENT_EXTRACTION_REPOSITORY } from "./application/ports/document-extraction.repository";
import { EXTRACTION_ATTEMPT_REPOSITORY } from "./application/ports/extraction-attempt.repository";
import { EXTRACTION_CHUNK_REPOSITORY } from "./application/ports/extraction-chunk.repository";
import { EXTRACTION_DISPATCHER } from "./application/ports/extraction-dispatcher";
import { NATIVE_TEXT_EXTRACTOR } from "./application/ports/native-text-extractor";
import { OCR_PROVIDER } from "./application/ports/ocr-provider";
import { OFFICE_DOCUMENT_EXTRACTOR } from "./application/ports/office-document-extractor";
import { PDF_INSPECTOR } from "./application/ports/pdf-inspector";
import { PDF_RASTERIZER } from "./application/ports/pdf-rasterizer";
import { SPREADSHEET_EXTRACTOR } from "./application/ports/spreadsheet-extractor";
import { TEXT_SEGMENTER } from "./application/ports/text-segmenter";

import { GetDocumentAnalysisInputUseCase } from "./application/use-cases/get-document-analysis-input.use-case";
import { GetDocumentExtractionUseCase } from "./application/use-cases/get-document-extraction.use-case";
import { ProcessDocumentExtractionUseCase } from "./application/use-cases/process-document-extraction.use-case";
import { RetryDocumentExtractionUseCase } from "./application/use-cases/retry-document-extraction.use-case";
import { StartDocumentExtractionUseCase } from "./application/use-cases/start-document-extraction.use-case";

import { EXTRACTION_CONFIG, loadExtractionConfig } from "./infrastructure/extraction-config";
import { InProcessExtractionDispatcher } from "./infrastructure/in-process-extraction.dispatcher";
import { DeterministicTextSegmenter } from "./infrastructure/deterministic-text-segmenter";
import { MammothOfficeDocumentExtractor } from "./infrastructure/mammoth-office-document-extractor";
import { PdfParseInspector } from "./infrastructure/pdf-parse-inspector";
import { PdfParseNativeTextExtractor } from "./infrastructure/pdf-parse-native-text-extractor";
import { PdfParseRasterizer } from "./infrastructure/pdf-parse-rasterizer";
import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaDocumentExtractionRepository } from "./infrastructure/prisma-document-extraction.repository";
import { PrismaExtractionAttemptRepository } from "./infrastructure/prisma-extraction-attempt.repository";
import { PrismaExtractionChunkRepository } from "./infrastructure/prisma-extraction-chunk.repository";
import { TesseractOcrProvider } from "./infrastructure/tesseract-ocr.provider";
import { XlsxSpreadsheetExtractor } from "./infrastructure/xlsx-spreadsheet-extractor";

import { ExtractionController } from "./interfaces/http/extraction.controller";

@Module({
  imports: [IdentityModule, MembershipsModule, TendersModule, DocumentsModule, DceModule],
  controllers: [ExtractionController],
  providers: [
    StartDocumentExtractionUseCase,
    GetDocumentExtractionUseCase,
    RetryDocumentExtractionUseCase,
    ProcessDocumentExtractionUseCase,
    // Correction P1-04 — le seul point d'entrée applicatif que le futur module d'analyse IA
    // (Sprint 4) doit utiliser pour lire le corpus de chunks ; jamais un accès direct à
    // l'infrastructure de ce module.
    GetDocumentAnalysisInputUseCase,

    { provide: DOCUMENT_EXTRACTION_REPOSITORY, useClass: PrismaDocumentExtractionRepository },
    { provide: EXTRACTION_ATTEMPT_REPOSITORY, useClass: PrismaExtractionAttemptRepository },
    { provide: EXTRACTION_CHUNK_REPOSITORY, useClass: PrismaExtractionChunkRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: PDF_INSPECTOR, useClass: PdfParseInspector },
    { provide: NATIVE_TEXT_EXTRACTOR, useClass: PdfParseNativeTextExtractor },
    { provide: PDF_RASTERIZER, useClass: PdfParseRasterizer },
    { provide: OCR_PROVIDER, useClass: TesseractOcrProvider },
    { provide: OFFICE_DOCUMENT_EXTRACTOR, useClass: MammothOfficeDocumentExtractor },
    { provide: SPREADSHEET_EXTRACTOR, useClass: XlsxSpreadsheetExtractor },
    { provide: TEXT_SEGMENTER, useClass: DeterministicTextSegmenter },
    { provide: EXTRACTION_DISPATCHER, useClass: InProcessExtractionDispatcher },
    // Mission Sprint 3 §20 — la factory s'exécute une seule fois, à l'instanciation du module
    // (donc au démarrage de l'application) : une configuration absente ou invalide fait échouer
    // NestFactory.create(...) avant même que le serveur n'écoute, jamais au milieu d'une requête
    // (même motif que DCE_CONFIG).
    { provide: EXTRACTION_CONFIG, useFactory: () => loadExtractionConfig() },
  ],
  // Dépendance technique strictement nécessaire (mission Sprint 4.1) — sans cet export, aucun
  // module consommateur ne peut injecter `GetDocumentAnalysisInputUseCase` via le mécanisme de DI
  // NestJS standard, même en important `ExtractionModule` : le réexport déjà présent dans
  // `index.ts` (correction P1-04) ne suffit qu'au typage, jamais à la résolution DI runtime.
  exports: [GetDocumentAnalysisInputUseCase],
})
export class ExtractionModule {}
