import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SavedSearchMatchNotFoundError, SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { isSavedSearchMatchStatus } from "../../domain/enums";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../ports/saved-search-match.repository";

export type SetMatchStatusCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; matchId: string; status: string }>;

/** Mission §51/§52 — Favori/Intéressé/Ignorer. Un marché ignoré ne revient jamais comme "nouveau"
 *  (le statut persiste, `SyncMarketSourceUseCase` ne le réinitialise jamais). */
@Injectable()
export class SetMatchStatusUseCase {
  constructor(
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly matchRepository: SavedSearchMatchRepository,
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetMatchStatusCommand): Promise<void> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.Read);
    if (!isSavedSearchMatchStatus(command.status)) {
      throw new SavedSearchMatchNotFoundError();
    }

    const match = await this.matchRepository.findById({ organizationId: command.organizationId, matchId: command.matchId });
    if (!match) {
      throw new SavedSearchMatchNotFoundError();
    }

    const savedSearch = await this.savedSearchRepository.findById({ organizationId: command.organizationId, savedSearchId: match.savedSearchId });
    if (!savedSearch || savedSearch.ownerUserId !== command.actorId) {
      throw new SavedSearchNotFoundError();
    }

    match.setStatus(command.status, this.clock.now());
    await this.matchRepository.save(match);
  }
}
