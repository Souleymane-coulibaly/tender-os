import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { KnowledgeEntryNotFoundError, KnowledgeEntryVersionNotFoundError } from "../../domain/errors";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { assertKnowledgeEntryClientAccess } from "../policies/knowledge-entry-client-access.policy";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY, type KnowledgeEntryVersionRepository } from "../ports/knowledge-entry-version.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type ValidateKnowledgeEntryCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** V2 Sprint 8 §15/§16/§19 — décision humaine explicite et traçable : la SEULE porte d'entrée qui
 *  fait passer la version active d'une entrée de "extraite/rédigée" à "réutilisable en confiance".
 *  Aucun autre chemin de code (création, mise à jour, fin de traitement IA) ne pose jamais ce
 *  stamp — voir `KnowledgeEntry.validate`/`updateMetadata`/`startDocumentProcessing`. */
@Injectable()
export class ValidateKnowledgeEntryUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_ENTRY_VERSION_REPOSITORY) private readonly knowledgeEntryVersionRepository: KnowledgeEntryVersionRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ValidateKnowledgeEntryCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Validate);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    await assertKnowledgeEntryClientAccess(this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      entry,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ValidateKnowledge,
    });

    const activeVersion = await this.knowledgeEntryVersionRepository.findByVersionNumber({
      organizationId: command.organizationId,
      knowledgeEntryId: entry.id,
      versionNumber: entry.activeVersionNumber,
    });
    if (!activeVersion) {
      throw new KnowledgeEntryVersionNotFoundError();
    }

    const occurredAt = this.clock.now();
    entry.validate(command.actorId, occurredAt);
    const validatedVersion = activeVersion.withValidation(command.actorId, occurredAt);

    // Correctif audit Codex P1-02 — le stamp de validation sur l'entrée (dénormalisé) ET sur sa
    // version active (vérité historique), avec l'audit et l'Outbox, sont écrits DANS LA MÊME
    // transaction : jamais une entrée "validée" dont la version active ne l'est pas réellement.
    await this.knowledgeEntryRepository.saveValidationWithVersion({
      entry,
      version: validatedVersion,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.validated",
        resourceType: "knowledge_entry",
        resourceId: entry.id,
        requestId: command.requestId,
      },
      outboxEvents: [
        {
          eventType: "KnowledgeEntryValidated",
          aggregateType: "KnowledgeEntry",
          aggregateId: entry.id,
          payload: { versionNumber: activeVersion.versionNumber, validatedByUserId: command.actorId },
          occurredAt,
        },
      ],
    });

    const [tags, documents] = await Promise.all([
      this.knowledgeTagRepository.listByEntryId({ organizationId: command.organizationId, knowledgeEntryId: entry.id }),
      this.knowledgeDocumentRepository.listByEntryId({ organizationId: command.organizationId, knowledgeEntryId: entry.id }),
    ]);
    return toKnowledgeEntrySummary(entry, tags, documents.length);
  }
}
