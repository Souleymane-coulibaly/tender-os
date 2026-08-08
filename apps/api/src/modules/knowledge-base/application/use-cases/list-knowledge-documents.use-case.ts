import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { assertKnowledgeEntryClientAccess } from "../policies/knowledge-entry-client-access.policy";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { toKnowledgeDocumentSummary, type KnowledgeDocumentSummary } from "../dtos";

export type ListKnowledgeDocumentsQuery = Readonly<{ organizationId: string; knowledgeEntryId: string; actorId: string; actorRole: string }>;

@Injectable()
export class ListKnowledgeDocumentsUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListKnowledgeDocumentsQuery): Promise<KnowledgeDocumentSummary[]> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const entry = await this.knowledgeEntryRepository.findById(query);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    await assertKnowledgeEntryClientAccess(this.assertClientAccessUseCase, { organizationId: query.organizationId, entry, actorId: query.actorId, actorRole: query.actorRole, permission: ClientPermission.ReadKnowledge });

    const documents = await this.knowledgeDocumentRepository.listByEntryId(query);
    return documents.map(toKnowledgeDocumentSummary);
  }
}
