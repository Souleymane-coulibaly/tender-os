import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type GetKnowledgeEntryQuery = Readonly<{ organizationId: string; knowledgeEntryId: string; actorRole: string }>;

@Injectable()
export class GetKnowledgeEntryUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
  ) {}

  async execute(query: GetKnowledgeEntryQuery): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const entry = await this.knowledgeEntryRepository.findById(query);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }

    const [tags, documents] = await Promise.all([
      this.knowledgeTagRepository.listByEntryId(query),
      this.knowledgeDocumentRepository.listByEntryId(query),
    ]);

    return toKnowledgeEntrySummary(entry, tags, documents.length);
  }
}
