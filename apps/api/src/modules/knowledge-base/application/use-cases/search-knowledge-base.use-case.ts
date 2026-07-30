import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_SEARCH_PROVIDER, type KnowledgeSearchProvider } from "../ports/knowledge-search-provider";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeSearchResultDto, type KnowledgeSearchResultDto } from "../dtos";

export type SearchKnowledgeBaseQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  query: string;
  category?: string | undefined;
  tagId?: string | undefined;
  status?: string | undefined;
  includeArchived?: boolean | undefined;
  createdAfter?: string | undefined;
  createdBefore?: string | undefined;
  clientAccountId?: string | "GLOBAL" | undefined;
  limit: number;
  offset: number;
}>;

export type SearchKnowledgeBaseResult = Readonly<{ items: readonly KnowledgeSearchResultDto[]; total: number }>;

/**
 * Recherche textuelle (mission Sprint 5 §8/§9) — délègue la recherche elle-même au port
 * `KnowledgeSearchProvider` (jamais un accès direct à Prisma ici), puis enrichit chaque résultat
 * brut avec le titre/catégorie/tags/statut de l'entrée (mission §"Ne pas afficher uniquement un
 * identifiant technique") — une seule requête groupée par entrée distincte, jamais une requête par
 * résultat (mission §"Performance", éviter le N+1).
 */
@Injectable()
export class SearchKnowledgeBaseUseCase {
  constructor(
    @Inject(KNOWLEDGE_SEARCH_PROVIDER) private readonly knowledgeSearchProvider: KnowledgeSearchProvider,
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: SearchKnowledgeBaseQuery): Promise<SearchKnowledgeBaseResult> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Search);

    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0 && query.clientAccountId !== "GLOBAL" && query.clientAccountId !== undefined) {
      return { items: [], total: 0 };
    }

    const page = await this.knowledgeSearchProvider.search({
      organizationId: query.organizationId,
      query: query.query,
      category: query.category ? parseKnowledgeCategory(query.category) : undefined,
      tagId: query.tagId,
      status: query.status,
      includeArchived: query.includeArchived ?? false,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
      clientAccountId: query.clientAccountId,
      restrictToClientAccountIdsOrGlobal: accessible.allClients ? undefined : accessible.clientAccountIds,
      limit: query.limit,
      offset: query.offset,
    });

    const distinctEntryIds = [...new Set(page.matches.map((match) => match.knowledgeEntryId))];
    const entries = await Promise.all(
      distinctEntryIds.map((knowledgeEntryId) => this.knowledgeEntryRepository.findById({ organizationId: query.organizationId, knowledgeEntryId })),
    );
    const entriesById = new Map(entries.filter((entry) => entry !== null).map((entry) => [entry!.id, entry!]));

    const tagsByEntryId = new Map(
      await Promise.all(
        distinctEntryIds.map(
          async (knowledgeEntryId) => [knowledgeEntryId, await this.knowledgeTagRepository.listByEntryId({ organizationId: query.organizationId, knowledgeEntryId })] as const,
        ),
      ),
    );

    const items = page.matches
      .map((match) => {
        const entry = entriesById.get(match.knowledgeEntryId);
        if (!entry) return null; // entrée supprimée entre l'indexation et la lecture — jamais un résultat fantôme.
        return toKnowledgeSearchResultDto(match, entry, tagsByEntryId.get(match.knowledgeEntryId) ?? []);
      })
      .filter((item): item is KnowledgeSearchResultDto => item !== null);

    return { items, total: page.total };
  }
}
