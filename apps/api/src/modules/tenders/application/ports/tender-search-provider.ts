export type TenderSearchCriteria = Readonly<{
  organizationId: string;
  query: string;
}>;

/**
 * Abstraction du "matching" texte libre sur les Tenders — décidée pour la mission
 * Kanban & List Views (le module Tenders doit préparer une architecture de recherche
 * extensible sans complexifier l'implémentation actuelle). Aujourd'hui : une simple
 * correspondance ILIKE Postgres (voir PrismaIlikeTenderSearchProvider). Demain, sans
 * toucher aux use cases ni aux contrôleurs qui dépendent de cette seule interface :
 * recherche plein texte (OpenSearch, déjà dans la stack cible — voir CLAUDE.md),
 * filtres avancés combinés, ou classement assisté par IA (recommandation de résultats).
 * Seul le binding DI (TENDER_SEARCH_PROVIDER) change lors d'une telle évolution.
 */
export interface TenderSearchProvider {
  /** Ids des Tenders correspondant à la requête texte libre, sans ordre garanti au-delà
   *  de celui choisi par l'implémentation. Le tri final reste piloté par le repository. */
  findMatchingTenderIds(criteria: TenderSearchCriteria): Promise<string[]>;
}

export const TENDER_SEARCH_PROVIDER = Symbol("TENDER_SEARCH_PROVIDER");
