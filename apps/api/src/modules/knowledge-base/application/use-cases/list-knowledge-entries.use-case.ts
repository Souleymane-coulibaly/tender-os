import { Inject, Injectable } from "@nestjs/common";
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
  actorRole: string;
  category?: string | undefined;
  status?: string | undefined;
  tagId?: string | undefined;
  includeArchived?: boolean | undefined;
  createdAfter?: string | undefined;
  createdBefore?: string | undefined;
  titleSearch?: string | undefined;
  cursor?: string | undefined;
  limit: number;
  sort?: "createdAt" | "updatedAt" | "title" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
}>;

export type ListKnowledgeEntriesResult = Readonly<{ items: readonly KnowledgeEntrySummary[]; nextCursor: string | null; total: number }>;

/** Mission Sprint 5 §10/§9 — liste paginée avec filtres (catégorie, tag, statut, date, archivage),
 *  jamais un chargement complet en mémoire (mission §"Performance"). */
@Injectable()
export class ListKnowledgeEntriesUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
  ) {}

  async execute(query: ListKnowledgeEntriesQuery): Promise<ListKnowledgeEntriesResult> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const page = await this.knowledgeEntryRepository.list({
      organizationId: query.organizationId,
      category: query.category ? parseKnowledgeCategory(query.category) : undefined,
      status: query.status ? parseKnowledgeEntryStatus(query.status) : undefined,
      tagId: query.tagId,
      includeArchived: query.includeArchived ?? false,
      createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
      createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
      titleSearch: query.titleSearch,
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
