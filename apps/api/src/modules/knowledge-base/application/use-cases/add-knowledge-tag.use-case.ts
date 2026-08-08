import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { KnowledgeEntryArchivedError, KnowledgeEntryNotFoundError } from "../../domain/errors";
import { KnowledgeEntryStatus } from "../../domain/knowledge-entry-status";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { normalizeTagLabel } from "../../domain/tag-normalizer";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { assertKnowledgeEntryClientAccess } from "../policies/knowledge-entry-client-access.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeTagSummary, type KnowledgeTagSummary } from "../dtos";

export type AddKnowledgeTagCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  actorId: string;
  actorRole: string;
  label: string;
  requestId?: string | undefined;
}>;

/** Mission Sprint 5 §4/§10 — n'appelle JAMAIS `KnowledgeEntry.updateMetadata`/ne crée jamais de
 *  nouvelle version : l'ajout d'un tag est volontairement léger (mission §"éviter que chaque
 *  changement mineur de tag produise une version lourde"). */
@Injectable()
export class AddKnowledgeTagUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: AddKnowledgeTagCommand): Promise<KnowledgeTagSummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.ManageTags);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    await assertKnowledgeEntryClientAccess(this.assertClientAccessUseCase, { organizationId: command.organizationId, entry, actorId: command.actorId, actorRole: command.actorRole, permission: ClientPermission.ManageKnowledge });
    if (entry.status === KnowledgeEntryStatus.Archived) {
      throw new KnowledgeEntryArchivedError();
    }

    const occurredAt = this.clock.now();
    const tag = await this.knowledgeTagRepository.findOrCreate({
      organizationId: command.organizationId,
      label: normalizeTagLabel(command.label),
      displayLabel: command.label.trim(),
      occurredAt,
    });
    await this.knowledgeTagRepository.attachToEntry({ organizationId: command.organizationId, knowledgeEntryId: entry.id, tagId: tag.id, occurredAt });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "knowledge_entry.tag_added",
      resourceType: "knowledge_entry",
      resourceId: entry.id,
      requestId: command.requestId,
      metadata: { tagId: tag.id, label: tag.label },
    });

    return toKnowledgeTagSummary(tag);
  }
}
