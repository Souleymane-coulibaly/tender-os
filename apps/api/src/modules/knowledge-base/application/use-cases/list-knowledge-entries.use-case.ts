import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { parseKnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type ListKnowledgeEntriesQuery = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  category?: string | undefined;
  status?: string | undefined;
  tagId?: string | undefined;
  includeArchived?: boolean | undefined;
  createdAfter?: string | undefined;
  createdBefore?: string | undefined;
  titleSearch?: string | undefined;
  /** Mission Sprint 5.1 §"filtre client" — `"GLOBAL"` pour ne voir que les entrées de
   *  l'organisation, un id de client pour ne voir que les siennes ; absent = toutes les entrées
   *  accessibles (globales + celles des clients auxquels l'acteur est affecté). */
  clientAccountId?: string | "GLOBAL" | undefined;
  cursor?: string | undefined;
  limit: number;
  sort?: "createdAt" | "updatedAt" | "title" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListKnowledgeEntriesResult = Readonly<{ items: readonly KnowledgeEntrySummary[]; nextCursor: string | null; total: number }>;

/** Mission Sprint 5 §10/§9 — liste paginée avec filtres (catégorie, tag, statut, date, archivage),
 *  jamais un chargement complet en mémoire (mission §"Performance"). Mission Sprint 5.1 §"Knowledge
 *  Base" — restreint automatiquement aux entrées globales + celles des clients accessibles à
 *  l'acteur (`ListAccessibleClientsUseCase`), jamais une entrée d'un client auquel il n'est pas
 *  affecté, quel que soit le filtre demandé. */
@Injectable()
export class ListKnowledgeEntriesUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: ListKnowledgeEntriesQuery): Promise<ListKnowledgeEntriesResult> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const accessible = await this.listAccessibleClientsUseCase.execute(query);
    if (!accessible.allClients && accessible.clientAccountIds.length === 0 && query.clientAccountId !== "GLOBAL" && query.clientAccountId !== undefined) {
      return { items: [], nextCursor: null, total: 0 };
    }

    const page = await this.knowledgeEntryRepository.list({
      organizationId: query.organizationId,
      category: query.category ? parseKnowledgeCategory(query.category) : undefined,
      status: query.status ? parseKnowledgeEntryStatus(query.status) : undefined,
      tagId: query.tagId,
      includeArchived: query.includeArchived ?? false,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
      titleSearch: query.titleSearch,
      clientAccountId: query.clientAccountId,
      restrictToClientAccountIdsOrGlobal: accessible.allClients ? undefined : accessible.clientAccountIds,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });

    const items = await Promise.all(
      page.items.map(async (entry) => {
        const [tags, documents] = await Promise.all([
          this.knowledgeTagRepository.listByEntryId({ organizationId: query.organizationId, knowledgeEntryId: entry.id }),
          this.knowledgeDocumentRepository.listByEntryId({ organizationId: query.organizationId, knowledgeEntryId: entry.id }),
        ]);
        return toKnowledgeEntrySummary(entry, tags, documents.length);
      }),
    );

    return { items, nextCursor: page.nextCursor, total: page.total };
  }
}
