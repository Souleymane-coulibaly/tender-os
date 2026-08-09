export type DceChunkMatch = Readonly<{
  documentId: string;
  /** Version COURANTE du document au moment de la recherche (`Document.currentVersionId`) — jamais
   *  la version qui a produit le chunk lui-même (l'extraction n'enregistre pas cette information,
   *  voir `DocumentExtraction`) : correctif audit Codex P1 — une citation DOCUMENT doit pouvoir
   *  désigner la version exacte consultée, `undefined` uniquement si le document n'a encore aucune
   *  version courante (cas transitoire de création). */
  documentVersionId?: string | undefined;
  documentTitle: string;
  chunkSequence: number;
  content: string;
  pageStart?: number | undefined;
  pageEnd?: number | undefined;
  sheetName?: string | undefined;
  sectionTitle?: string | undefined;
}>;

/** Recherche scopée à un seul Tender (jamais cross-tender) — résout la liste de documents du DCE de
 *  CE Tender AVANT toute requête sur `extraction_chunks` (mission §49/§50 "le filtrage a lieu avant
 *  toute requête de retrieval"). Aucune réextraction : les chunks existent déjà (module Extraction,
 *  Sprint 3). */
export interface DceChunkSearchProvider {
  search(input: { organizationId: string; tenderId: string; query: string; limit: number }): Promise<readonly DceChunkMatch[]>;
}

export const DCE_CHUNK_SEARCH_PROVIDER = Symbol("DCE_CHUNK_SEARCH_PROVIDER");
