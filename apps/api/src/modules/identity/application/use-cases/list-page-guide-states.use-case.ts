import { Inject, Injectable } from "@nestjs/common";
import { PAGE_GUIDE_STATE_REPOSITORY, type PageGuideStateRepository } from "../ports/page-guide-state.repository";
import { toPageGuideStateSummary, type PageGuideStateSummary } from "../dtos";

export type ListPageGuideStatesQuery = Readonly<{ userId: string }>;

/**
 * TENDEROS-2.1 (guides de page) — guides déjà terminés ou écartés par L'UTILISATEUR courant.
 * User-scoped comme `UpdateTourStateUseCase` : aucun `organizationId`, et `userId` provient
 * toujours de l'acteur authentifié, jamais de la requête.
 */
@Injectable()
export class ListPageGuideStatesUseCase {
  constructor(@Inject(PAGE_GUIDE_STATE_REPOSITORY) private readonly repository: PageGuideStateRepository) {}

  async execute(query: ListPageGuideStatesQuery): Promise<PageGuideStateSummary[]> {
    const states = await this.repository.listByUser(query.userId);

    return states.map(toPageGuideStateSummary);
  }
}
