import type {
  KnowledgeDocumentSummary,
  KnowledgeEntrySummary,
  KnowledgeEntryVersionSummary,
  KnowledgeSearchResultDto,
  KnowledgeSpaceSummary,
  KnowledgeTagSummary,
} from "../../application/dtos";
import type { KnowledgeDocumentDetail } from "../../application/use-cases/get-knowledge-document.use-case";

// Passe-plat volontaire (même motif que Analysis/Documents) — les DTO n'exposent déjà jamais de
// détail interne (storageKey, contenu complet non demandé, etc.).
export function presentKnowledgeSpace(space: KnowledgeSpaceSummary): KnowledgeSpaceSummary {
  return { ...space };
}

export function presentKnowledgeEntry(entry: KnowledgeEntrySummary): KnowledgeEntrySummary {
  return { ...entry };
}

export function presentKnowledgeDocument(document: KnowledgeDocumentSummary): KnowledgeDocumentSummary {
  return { ...document };
}

export function presentKnowledgeDocumentDetail(document: KnowledgeDocumentDetail): KnowledgeDocumentDetail {
  return { ...document };
}

export function presentKnowledgeEntryVersion(version: KnowledgeEntryVersionSummary): KnowledgeEntryVersionSummary {
  return { ...version };
}

export function presentKnowledgeTag(tag: KnowledgeTagSummary): KnowledgeTagSummary {
  return { ...tag };
}

export function presentKnowledgeSearchResult(result: KnowledgeSearchResultDto): KnowledgeSearchResultDto {
  return { ...result };
}

export function presentPage<T>(items: T[], nextCursor: string | null): { items: T[]; nextCursor: string | null } {
  return { items, nextCursor };
}
