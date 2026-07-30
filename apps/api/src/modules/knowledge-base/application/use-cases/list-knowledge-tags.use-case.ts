import { Inject, Injectable } from "@nestjs/common";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeTagSummary, type KnowledgeTagSummary } from "../dtos";

export type ListKnowledgeTagsQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListKnowledgeTagsUseCase {
  constructor(@Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository) {}

  async execute(query: ListKnowledgeTagsQuery): Promise<KnowledgeTagSummary[]> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const tags = await this.knowledgeTagRepository.listByOrganization(query);
    return tags.map(toKnowledgeTagSummary);
  }
}
