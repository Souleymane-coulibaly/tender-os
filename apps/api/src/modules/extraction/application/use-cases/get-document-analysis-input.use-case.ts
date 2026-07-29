import { Inject, Injectable } from "@nestjs/common";
import { DCE_DOCUMENT_REPOSITORY, DCE_REPOSITORY, type DceDocumentRepository, type DceRepository } from "../../../dce";
import { GetTenderUseCase } from "../../../tenders";
import { DocumentExtractionStatus } from "../../domain/document-extraction-status";
import { DocumentExtractionNotFoundError, ExtractionNotReadyForAnalysisError } from "../../domain/extraction-errors";
import { ExtractionPermission } from "../../domain/extraction-permission";
import { assertHasExtractionPermission } from "../policies/extraction-authorization.policy";
import { DOCUMENT_EXTRACTION_REPOSITORY, type DocumentExtractionRepository } from "../ports/document-extraction.repository";
import { EXTRACTION_CHUNK_REPOSITORY, type ExtractionChunkRepository } from "../ports/extraction-chunk.repository";

export type GetDocumentAnalysisInputQuery = Readonly<{
  organizationId: string;
  tenderId: string;
  documentId: string;
  actorRole: string;
}>;

export type DocumentAnalysisChunk = Readonly<{
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

/**
 * Corpus prêt pour une future analyse IA (correction P1-04, mission Sprint 3 §"Sprint 4
 * débloqué") — le seul chemin applicatif que le futur module d'analyse doit utiliser : jamais
 * Prisma, jamais un repository infrastructure, jamais un contrôleur HTTP interne du module
 * Extraction. Contrat stable, composé uniquement de ports/use cases déjà publics des modules
 * Tenders/DCE/Extraction.
 */
export type DocumentAnalysisInput = Readonly<{
  organizationId: string;
  tenderId: string;
  dceId: string;
  documentId: string;
  documentName: string;
  /** Classification DCE (ADMINISTRATIVE/TECHNICAL/FINANCIAL/DRAWINGS/OTHER) — jamais une
   *  classification IA, une donnée déterministe déjà calculée à l'import (module DCE). */
  documentType: string;
  /** Partage sa valeur avec `documentId` (relation 1:1, voir DocumentExtraction) — nommé
   *  séparément pour ne jamais laisser le futur module Sprint 4 supposer une relation autre que
   *  1:1 par accident de nommage. */
  extractionId: string;
  extractionStatus: typeof DocumentExtractionStatus.Succeeded | typeof DocumentExtractionStatus.PartiallySucceeded;
  /** Nombre de tentatives ayant abouti à ce résultat (`DocumentExtraction.attemptCount`) — sert
   *  de numéro de version grossier : un consommateur peut détecter qu'un résultat a changé sans
   *  comparer le contenu des chunks un à un. */
  extractionVersion: number;
  language?: string | undefined;
  /** true si `PARTIALLY_SUCCEEDED` — le futur module d'analyse doit pouvoir pondérer sa confiance
   *  en conséquence, jamais traiter un résultat partiel comme un résultat complet silencieusement. */
  partial: boolean;
  warnings: readonly string[];
  chunks: readonly DocumentAnalysisChunk[];
}>;

const READY_STATUSES = new Set<string>([
  DocumentExtractionStatus.Succeeded,
  DocumentExtractionStatus.PartiallySucceeded,
]);

/**
 * Mission Sprint 3 correction P1-04 — même chaîne d'autorisation que les autres lectures
 * Extraction (Tender → DCE → document → permission), jamais un accès direct par documentId seul :
 * un acteur d'une autre organisation ne peut jamais récupérer un corpus qui ne lui appartient pas.
 */
@Injectable()
export class GetDocumentAnalysisInputUseCase {
  constructor(
    @Inject(DOCUMENT_EXTRACTION_REPOSITORY) private readonly extractionRepository: DocumentExtractionRepository,
    @Inject(EXTRACTION_CHUNK_REPOSITORY) private readonly chunkRepository: ExtractionChunkRepository,
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(DCE_DOCUMENT_REPOSITORY) private readonly dceDocumentRepository: DceDocumentRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(query: GetDocumentAnalysisInputQuery): Promise<DocumentAnalysisInput> {
    assertHasExtractionPermission(query.actorRole, ExtractionPermission.Read);

    await this.getTenderUseCase.execute({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorRole: query.actorRole,
    });

    const dce = await this.dceRepository.findByTenderId({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
    });
    if (!dce) {
      throw new DocumentExtractionNotFoundError();
    }

    const summary = await this.dceDocumentRepository.getSummaryByDocumentId({
      organizationId: query.organizationId,
      dceId: dce.id.value,
      documentId: query.documentId,
    });
    if (!summary) {
      throw new DocumentExtractionNotFoundError();
    }

    const extraction = await this.extractionRepository.findByDocumentId({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    if (!extraction) {
      throw new DocumentExtractionNotFoundError();
    }
    if (!READY_STATUSES.has(extraction.status)) {
      throw new ExtractionNotReadyForAnalysisError({ status: extraction.status });
    }

    const chunks = await this.chunkRepository.listByDocumentId({
      organizationId: query.organizationId,
      documentId: query.documentId,
    });
    // Ordre déterministe garanti ici, jamais seulement supposé de l'implémentation du repository
    // (mission P1-04 "chunks ordonnés de manière déterministe") ; jamais un chunk vide.
    const orderedChunks = chunks
      .filter((chunk) => chunk.content.trim().length > 0)
      .slice()
      .sort((a, b) => a.sequence - b.sequence);

    return {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      dceId: dce.id.value,
      documentId: query.documentId,
      documentName: summary.originalFilename,
      documentType: summary.category,
      extractionId: extraction.documentId,
      extractionStatus: extraction.status as
        | typeof DocumentExtractionStatus.Succeeded
        | typeof DocumentExtractionStatus.PartiallySucceeded,
      extractionVersion: extraction.attemptCount,
      language: extraction.language,
      partial: extraction.status === DocumentExtractionStatus.PartiallySucceeded,
      warnings: extraction.warnings,
      chunks: orderedChunks.map((chunk) => ({
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
  }
}
