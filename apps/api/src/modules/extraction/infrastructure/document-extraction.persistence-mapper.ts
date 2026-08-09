import type { DocumentExtraction as DocumentExtractionRecord } from "@prisma/client";
import { DocumentExtraction } from "../domain/document-extraction.aggregate";
import type { DocumentExtractionStatus } from "../domain/document-extraction-status";
import type { DocumentExtractionStrategy } from "../domain/document-extraction-strategy";

export type DocumentExtractionPersistenceData = {
  documentId: string;
  dceId: string;
  organizationId: string;
  status: string;
  strategy: string | null;
  attemptCount: number;
  pageCount: number | null;
  characterCount: number | null;
  chunkCount: number | null;
  language: string | null;
  warnings: string[];
  lastError: string | null;
  contentChecksum: string | null;
  documentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomain(record: DocumentExtractionRecord): DocumentExtraction {
  return DocumentExtraction.rehydrate({
    documentId: record.documentId,
    dceId: record.dceId,
    organizationId: record.organizationId,
    status: record.status as DocumentExtractionStatus,
    strategy: (record.strategy as DocumentExtractionStrategy | null) ?? undefined,
    attemptCount: record.attemptCount,
    pageCount: record.pageCount ?? undefined,
    characterCount: record.characterCount ?? undefined,
    chunkCount: record.chunkCount ?? undefined,
    language: record.language ?? undefined,
    warnings: record.warnings,
    lastError: record.lastError ?? undefined,
    contentChecksum: record.contentChecksum ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPersistence(extraction: DocumentExtraction): DocumentExtractionPersistenceData {
  return {
    documentId: extraction.documentId,
    dceId: extraction.dceId,
    organizationId: extraction.organizationId,
    status: extraction.status,
    strategy: extraction.strategy ?? null,
    attemptCount: extraction.attemptCount,
    pageCount: extraction.pageCount ?? null,
    characterCount: extraction.characterCount ?? null,
    chunkCount: extraction.chunkCount ?? null,
    language: extraction.language ?? null,
    warnings: extraction.warnings,
    lastError: extraction.lastError ?? null,
    contentChecksum: extraction.contentChecksum ?? null,
    documentVersionId: extraction.documentVersionId ?? null,
    createdAt: extraction.createdAt,
    updatedAt: extraction.updatedAt,
  };
}
