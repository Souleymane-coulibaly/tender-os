import type { KnowledgeChunk } from "../domain/knowledge-chunk.entity";
import type { KnowledgeDocument } from "../domain/knowledge-document.entity";
import type { KnowledgeEntry } from "../domain/knowledge-entry.aggregate";
import type { KnowledgeEntryVersion } from "../domain/knowledge-entry-version.entity";
import type { KnowledgeSpace } from "../domain/knowledge-space.aggregate";
import type { KnowledgeTag } from "../domain/knowledge-tag.entity";
import type { KnowledgeSearchMatch } from "./ports/knowledge-search-provider";

export type KnowledgeSpaceSummary = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export function toKnowledgeSpaceSummary(space: KnowledgeSpace): KnowledgeSpaceSummary {
  return {
    id: space.id,
    organizationId: space.organizationId,
    name: space.name,
    description: space.description,
    status: space.status,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
  };
}

export type KnowledgeTagSummary = { id: string; label: string; displayLabel: string; createdAt: string };

export function toKnowledgeTagSummary(tag: KnowledgeTag): KnowledgeTagSummary {
  return { id: tag.id, label: tag.label, displayLabel: tag.displayLabel, createdAt: tag.createdAt.toISOString() };
}

export type KnowledgeEntrySummary = {
  id: string;
  organizationId: string;
  knowledgeSpaceId: string;
  /** `undefined`/absent = connaissance globale de l'organisation, une valeur = spécifique à ce
   *  client (mission Sprint 5.1 §"Knowledge Base"). */
  clientAccountId?: string | undefined;
  title: string;
  description?: string | undefined;
  category: string;
  sourceType: string;
  status: string;
  language?: string | undefined;
  metadata: Record<string, unknown>;
  tags: KnowledgeTagSummary[];
  documentCount: number;
  activeVersionNumber: number;
  createdByUserId: string;
  updatedByUserId?: string | undefined;
  archivedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toKnowledgeEntrySummary(entry: KnowledgeEntry, tags: readonly KnowledgeTag[], documentCount: number): KnowledgeEntrySummary {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    knowledgeSpaceId: entry.knowledgeSpaceId,
    clientAccountId: entry.clientAccountId,
    title: entry.title,
    description: entry.description,
    category: entry.category,
    sourceType: entry.sourceType,
    status: entry.status,
    language: entry.language,
    metadata: entry.metadata,
    tags: tags.map(toKnowledgeTagSummary),
    documentCount,
    activeVersionNumber: entry.activeVersionNumber,
    createdByUserId: entry.createdByUserId,
    updatedByUserId: entry.updatedByUserId,
    archivedAt: entry.archivedAt?.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export type KnowledgeDocumentSummary = {
  id: string;
  organizationId: string;
  knowledgeEntryId: string;
  documentId: string;
  versionNumber: number;
  status: string;
  language?: string | undefined;
  warnings: readonly string[];
  errorMessage?: string | undefined;
  attemptCount: number;
  processedAt?: string | undefined;
  createdAt: string;
  updatedAt: string;
};

export function toKnowledgeDocumentSummary(document: KnowledgeDocument): KnowledgeDocumentSummary {
  return {
    id: document.id,
    organizationId: document.organizationId,
    knowledgeEntryId: document.knowledgeEntryId,
    documentId: document.documentId,
    versionNumber: document.versionNumber,
    status: document.status,
    language: document.language,
    warnings: document.warnings,
    errorMessage: document.errorMessage,
    attemptCount: document.attemptCount,
    processedAt: document.processedAt?.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export type KnowledgeChunkSummary = {
  id: string;
  knowledgeDocumentId: string;
  sequence: number;
  content: string;
  characterCount: number;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  checksum: string;
  createdAt: string;
};

export function toKnowledgeChunkSummary(chunk: KnowledgeChunk): KnowledgeChunkSummary {
  return {
    id: chunk.id,
    knowledgeDocumentId: chunk.knowledgeDocumentId,
    sequence: chunk.sequence,
    content: chunk.content,
    characterCount: chunk.characterCount,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    sheetName: chunk.sheetName,
    sectionTitle: chunk.sectionTitle,
    checksum: chunk.checksum,
    createdAt: chunk.createdAt.toISOString(),
  };
}

export type KnowledgeEntryVersionSummary = {
  id: string;
  knowledgeEntryId: string;
  versionNumber: number;
  reason?: string | undefined;
  snapshot: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
};

export function toKnowledgeEntryVersionSummary(version: KnowledgeEntryVersion): KnowledgeEntryVersionSummary {
  return {
    id: version.id,
    knowledgeEntryId: version.knowledgeEntryId,
    versionNumber: version.versionNumber,
    reason: version.reason,
    snapshot: version.snapshot,
    createdByUserId: version.createdByUserId,
    createdAt: version.createdAt.toISOString(),
  };
}

/** Résultat de recherche enrichi (mission §9) — jamais un simple identifiant technique : le titre,
 *  la catégorie, les tags et le statut de l'entrée accompagnent toujours l'extrait pertinent. */
export type KnowledgeSearchResultDto = {
  knowledgeEntryId: string;
  title: string;
  category: string;
  status: string;
  tags: string[];
  matchLocation: string;
  snippet: string;
  knowledgeDocumentId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
  activeVersionNumber: number;
};

export function toKnowledgeSearchResultDto(
  match: KnowledgeSearchMatch,
  entry: KnowledgeEntry,
  tags: readonly KnowledgeTag[],
): KnowledgeSearchResultDto {
  return {
    knowledgeEntryId: entry.id,
    title: entry.title,
    category: entry.category,
    status: entry.status,
    tags: tags.map((tag) => tag.displayLabel),
    matchLocation: match.matchLocation,
    snippet: match.snippet,
    knowledgeDocumentId: match.knowledgeDocumentId,
    chunkSequence: match.chunkSequence,
    pageStart: match.pageStart,
    pageEnd: match.pageEnd,
    sheetName: match.sheetName,
    sectionTitle: match.sectionTitle,
    activeVersionNumber: entry.activeVersionNumber,
  };
}
