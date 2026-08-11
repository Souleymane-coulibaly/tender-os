import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { SavedSearch } from "../../domain/saved-search.entity";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type ListSavedSearchesQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string }>;

/** Mission §16/§71 — strictement personnel : seules les veilles de L'ACTEUR COURANT, jamais celles
 *  d'un autre utilisateur. Une veille rattachée à un client dont l'accès a depuis été révoqué
 *  redevient invisible même à son propriétaire (même principe que Knowledge Base Sprint 8/Chat
 *  Sprint 9 — jamais un accès figé au moment de la création). */
@Injectable()
export class ListSavedSearchesUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListSavedSearchesQuery): Promise<SavedSearch[]> {
    assertHasMarketWatchPermission(query.actorRole, MarketWatchPermission.Read);

    const searches = await this.repository.listByOwner({ organizationId: query.organizationId, ownerUserId: query.actorId });
    const accessible = await this.listAccessibleClientsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole });

    if (accessible.allClients) {
      return searches;
    }
    return searches.filter((search) => !search.clientAccountId || accessible.clientAccountIds.includes(search.clientAccountId));
  }
}
