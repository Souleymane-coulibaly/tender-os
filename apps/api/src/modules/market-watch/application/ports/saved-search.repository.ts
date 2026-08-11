import type { SavedSearch } from "../../domain/saved-search.entity";

export interface SavedSearchRepository {
  create(search: SavedSearch): Promise<void>;
  save(search: SavedSearch): Promise<void>;
  findById(input: { organizationId: string; savedSearchId: string }): Promise<SavedSearch | null>;
  listByOwner(input: { organizationId: string; ownerUserId: string }): Promise<SavedSearch[]>;
  /** Mission §26 — le matching s'exécute sur le DELTA (nouveaux/mis à jour marchés) contre toutes
   *  les veilles actives de l'organisation, jamais l'inverse (jamais un balayage complet de tous
   *  les ExternalTenders par SavedSearch, mission §82/§83). */
  listActiveByOrganization(input: { organizationId: string }): Promise<SavedSearch[]>;
  /** Mission §58/§60 — le worker de collecte n'interroge une source QUE pour les organisations qui
   *  ont réellement une veille active (jamais un balayage de toutes les organisations de la
   *  plateforme, même celles sans aucun intérêt pour cette source). */
  listDistinctOrganizationIdsWithActiveSearches(): Promise<string[]>;
}

export const SAVED_SEARCH_REPOSITORY = Symbol("SAVED_SEARCH_REPOSITORY");
