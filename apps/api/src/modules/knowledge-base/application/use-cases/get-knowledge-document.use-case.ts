import { Inject, Injectable } from "@nestjs/common";
import { KnowledgeDocumentNotFoundError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_CHUNK_REPOSITORY, type KnowledgeChunkRepository } from "../ports/knowledge-chunk.repository";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { toKnowledgeChunkSummary, toKnowledgeDocumentSummary, type KnowledgeChunkSummary, type KnowledgeDocumentSummary } from "../dtos";

export type GetKnowledgeDocumentQuery = Readonly<{ organizationId: string; knowledgeEntryId: string; knowledgeDocumentId: string; actorRole: string }>;

export type KnowledgeDocumentDetail = KnowledgeDocumentSummary & { chunks: KnowledgeChunkSummary[] };

/** Mission Sprint 5 §5 "consulter le contenu extrait" — retourne le document ET ses chunks
 *  (contenu + provenance), jamais uniquement un statut technique. */
@Injectable()
export class GetKnowledgeDocumentUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(KNOWLEDGE_CHUNK_REPOSITORY) private readonly knowledgeChunkRepository: KnowledgeChunkRepository,
  ) {}

  async execute(query: GetKnowledgeDocumentQuery): Promise<KnowledgeDocumentDetail> {
    assertHasKnowledgePermission(query.actorRole, KnowledgePermission.Read);

    const entry = await this.knowledgeEntryRepository.findById(query);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }

    const document = await this.knowledgeDocumentRepository.findById(query);
    if (!document || document.knowledgeEntryId !== query.knowledgeEntryId) {
      throw new KnowledgeDocumentNotFoundError();
    }

    const chunks = await this.knowledgeChunkRepository.listByDocumentId({ organizationId: query.organizationId, knowledgeDocumentId: document.id });

    return { ...toKnowledgeDocumentSummary(document), chunks: chunks.map(toKnowledgeChunkSummary) };
  }
}
