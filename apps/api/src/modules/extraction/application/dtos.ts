import type { DocumentExtraction } from "../domain/document-extraction.aggregate";
import type { ExtractionChunk } from "../domain/extraction-chunk.entity";

export type DocumentExtractionSummary = {
  documentId: string;
  dceId: string;
  organizationId: string;
  status: string;
  strategy?: string | undefined;
  attemptCount: number;
  pageCount?: number | undefined;
  characterCount?: number | undefined;
  chunkCount?: number | undefined;
  language?: string | undefined;
  warnings: string[];
  lastError?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toDocumentExtractionSummary(extraction: DocumentExtraction): DocumentExtractionSummary {
  return {
    documentId: extraction.documentId,
    dceId: extraction.dceId,
    organizationId: extraction.organizationId,
    status: extraction.status,
    strategy: extraction.strategy,
    attemptCount: extraction.attemptCount,
    pageCount: extraction.pageCount,
    characterCount: extraction.characterCount,
    chunkCount: extraction.chunkCount,
    language: extraction.language,
    warnings: extraction.warnings,
    lastError: extraction.lastError,
    createdAt: extraction.createdAt.toISOString(),
    updatedAt: extraction.updatedAt.toISOString(),
  };
}

/** Jamais le contenu complet dans une vue de liste (mission Sprint 3 §17 — cohérent avec la
 *  règle déjà appliquée aux DocumentVersion : pas de fuite de contenu volumineux non demandé
 *  explicitement). */
export type ExtractionChunkSummary = {
  id: string;
  documentId: string;
  sequence: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  content: string;
  characterCount: number;
  tokenEstimate?: number | undefined;
  checksum: string;
};

export function toExtractionChunkSummary(chunk: ExtractionChunk): ExtractionChunkSummary {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    sequence: chunk.sequence,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    sheetName: chunk.sheetName,
    sectionTitle: chunk.sectionTitle,
    content: chunk.content,
    characterCount: chunk.characterCount,
    tokenEstimate: chunk.tokenEstimate,
    checksum: chunk.checksum,
  };
}
