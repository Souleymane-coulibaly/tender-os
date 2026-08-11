import { Inject, Injectable } from "@nestjs/common";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { ExternalTender } from "../../domain/external-tender.entity";
import type { SavedSearchMatch } from "../../domain/saved-search-match.entity";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../ports/external-tender.repository";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../ports/saved-search-match.repository";

export type ListSavedSearchMatchesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string; cursor?: string | undefined; limit: number }>;

export type SavedSearchMatchWithTender = Readonly<{ match: SavedSearchMatch; tender: ExternalTender }>;
export type ListSavedSearchMatchesResult = Readonly<{ items: SavedSearchMatchWithTender[]; nextCursor: string | null }>;

/** Mission §32/§88 — page "Marchés détectés" pour une veille précise, triée par pertinence (les
 *  matches sont déjà scorés par le matching engine ; le tri fin — deadline/récence/montant — est
 *  appliqué côté frontend/HTTP query sur cette page, mission §33). */
@Injectable()
export class ListSavedSearchMatchesUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly matchRepository: SavedSearchMatchRepository,
    @Inject(EXTERNAL_TENDER_REPOSITORY) private readonly externalTenderRepository: ExternalTenderRepository,
  ) {}

  async execute(query: ListSavedSearchMatchesQuery): Promise<ListSavedSearchMatchesResult> {
    assertHasMarketWatchPermission(query.actorRole, MarketWatchPermission.Read);

    const savedSearch = await this.savedSearchRepository.findById({ organizationId: query.organizationId, savedSearchId: query.savedSearchId });
    if (!savedSearch || savedSearch.ownerUserId !== query.actorId) {
      throw new SavedSearchNotFoundError();
    }

    const page = await this.matchRepository.listBySavedSearch({ organizationId: query.organizationId, savedSearchId: query.savedSearchId, cursor: query.cursor, limit: query.limit });
    const tenders = await this.externalTenderRepository.findManyByIds({ organizationId: query.organizationId, externalTenderIds: page.items.map((m) => m.externalTenderId) });
    const tenderById = new Map(tenders.map((t) => [t.id, t]));

    const items = page.items.map((match) => ({ match, tender: tenderById.get(match.externalTenderId) })).filter((entry): entry is SavedSearchMatchWithTender => entry.tender !== undefined);

    return { items, nextCursor: page.nextCursor };
  }
}
