import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { SavedSearch } from "../../domain/saved-search.entity";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type GetSavedSearchQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string }>;

@Injectable()
export class GetSavedSearchUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetSavedSearchQuery): Promise<SavedSearch> {
    assertHasMarketWatchPermission(query.actorRole, MarketWatchPermission.Read);

    const savedSearch = await this.repository.findById({ organizationId: query.organizationId, savedSearchId: query.savedSearchId });
    // Anti-IDOR (mission §17/§72) — une veille d'un autre utilisateur répond exactement comme si
    // elle n'existait pas, jamais un 403 qui confirmerait son existence.
    if (!savedSearch || savedSearch.ownerUserId !== query.actorId) {
      throw new SavedSearchNotFoundError();
    }

    if (savedSearch.clientAccountId) {
      // Mission §19/§71 — revalidé à chaque lecture, jamais un accès figé au moment de la création.
      try {
        await this.assertClientAccessUseCase.execute({
          organizationId: query.organizationId,
          clientAccountId: savedSearch.clientAccountId,
          actorId: query.actorId,
          actorRole: query.actorRole,
          permission: ClientPermission.Read,
        });
      } catch {
        throw new SavedSearchNotFoundError();
      }
    }

    return savedSearch;
  }
}
