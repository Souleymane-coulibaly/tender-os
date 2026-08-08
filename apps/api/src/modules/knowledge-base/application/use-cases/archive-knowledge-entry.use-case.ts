import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { assertKnowledgeEntryClientAccess } from "../policies/knowledge-entry-client-access.policy";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type ArchiveKnowledgeEntryCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class ArchiveKnowledgeEntryUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ArchiveKnowledgeEntryCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Archive);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    await assertKnowledgeEntryClientAccess(this.assertClientAccessUseCase, { organizationId: command.organizationId, entry, actorId: command.actorId, actorRole: command.actorRole, permission: ClientPermission.ManageKnowledge });

    const occurredAt = this.clock.now();
    entry.archive(occurredAt);

    // Correctif audit Codex P1-02 — l'entrée archivée, avec l'audit et l'Outbox, est écrite DANS
    // LA MÊME transaction : jamais un statut ARCHIVED persisté sans sa trace d'audit/Outbox.
    await this.knowledgeEntryRepository.saveWithAudit({
      entry,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.archived",
        resourceType: "knowledge_entry",
        resourceId: entry.id,
        requestId: command.requestId,
      },
      outboxEvents: [{ eventType: "KnowledgeEntryArchived", aggregateType: "KnowledgeEntry", aggregateId: entry.id, payload: {}, occurredAt }],
    });

    const [tags, documents] = await Promise.all([
      this.knowledgeTagRepository.listByEntryId(command),
      this.knowledgeDocumentRepository.listByEntryId(command),
    ]);
    return toKnowledgeEntrySummary(entry, tags, documents.length);
  }
}
