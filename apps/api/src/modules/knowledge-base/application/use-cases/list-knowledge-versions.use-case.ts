import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY, type KnowledgeEntryVersionRepository } from "../ports/knowledge-entry-version.repository";
import { toKnowledgeEntryVersionSummary, type KnowledgeEntryVersionSummary } from "../dtos";

export type ListKnowledgeVersionsQuery = Readonly<{ organizationId: string; knowledgeEntryId: string; actorRole: string }>;

@Injectable()
export class ListKnowledgeVersionsUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_ENTRY_VERSION_REPOSITORY) private readonly knowledgeEntryVersionRepository: KnowledgeEntryVersionRepository,
  ) {}

  async execute(query: ListKnowledgeVersionsQuery): Promise<KnowledgeEntryVersionSummary[]> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const entry = await this.knowledgeEntryRepository.findById(query);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }

    const versions = await this.knowledgeEntryVersionRepository.listByEntryId(query);
    return versions.map(toKnowledgeEntryVersionSummary);
  }
}
