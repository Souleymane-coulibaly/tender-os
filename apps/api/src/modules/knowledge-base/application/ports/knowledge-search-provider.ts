import type { KnowledgeCategory } from "../../domain/knowledge-category";

export type KnowledgeSearchCriteria = Readonly<{
  organizationId: string;
  query: string;
  category?: KnowledgeCategory | undefined;
  tagId?: string | undefined;
  status?: string | undefined;
  includeArchived: boolean;
  createdAfter?: Date | undefined;
  createdBefore?: Date | undefined;
  /** Mission Sprint 5.1 §"recherche tenant-aware+client-aware" — mêmes sémantiques que
   *  `ListKnowledgeEntriesFilter.clientAccountId`/`restrictToClientAccountIdsOrGlobal` : jamais une
   *  entrée client dans le résultat de recherche d'un autre client. */
  clientAccountId?: string | "GLOBAL" | undefined;
  restrictToClientAccountIdsOrGlobal?: readonly string[] | undefined;
  limit: number;
  offset: number;
}>;

export type KnowledgeSearchMatchLocation = "TITLE" | "DESCRIPTION" | "METADATA" | "CONTENT";

/** Un résultat brut de recherche (mission §9 "Résultats de recherche") — le port ne retourne QUE
 *  ce qui est vérifiable contre le corpus réel (mission §12 "aucune source inventée") :
 *  `snippet`/`chunkSequence`/page/section proviennent toujours d'un `KnowledgeChunk` réellement
 *  persisté quand `matchLocation` est `CONTENT`, jamais reconstruits. */
export type KnowledgeSearchMatch = Readonly<{
  knowledgeEntryId: string;
  matchLocation: KnowledgeSearchMatchLocation;
  snippet: string;
  knowledgeDocumentId?: string | undefined;
  chunkSequence?: number | undefined;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
}>;

export type KnowledgeSearchResultPage = Readonly<{ matches: readonly KnowledgeSearchMatch[]; total: number }>;

/**
 * Port applicatif de recherche (mission Sprint 5 §8 "Créer un port applicatif de recherche afin de
 * pouvoir changer l'implémentation plus tard") — l'implémentation V1 (`PrismaIlikeKnowledgeSearchProvider`)
 * utilise PostgreSQL ILIKE (même motif que `TenderSearchProvider`, module Tenders), jamais un moteur
 * vectoriel externe pour cette tranche (mission §"Ne pas imposer immédiatement une infrastructure
 * vectorielle externe") — mais AUCUN appelant ne dépend de ce détail : une future implémentation
 * sémantique peut remplacer l'adaptateur sans changer `SearchKnowledgeBaseUseCase`.
 */
export interface KnowledgeSearchProvider {
  search(criteria: KnowledgeSearchCriteria): Promise<KnowledgeSearchResultPage>;
}

export const KNOWLEDGE_SEARCH_PROVIDER = Symbol("KNOWLEDGE_SEARCH_PROVIDER");
