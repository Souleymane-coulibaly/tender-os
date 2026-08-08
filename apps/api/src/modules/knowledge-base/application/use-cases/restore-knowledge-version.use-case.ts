import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { KnowledgeEntryNotFoundError, KnowledgeEntryVersionNotFoundError } from "../../domain/errors";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { assertKnowledgeEntryClientAccess } from "../policies/knowledge-entry-client-access.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY, type KnowledgeEntryVersionRepository } from "../ports/knowledge-entry-version.repository";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type RestoreKnowledgeVersionCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  versionNumber: number;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Restauration d'une ancienne version (mission Sprint 5 §10 "restauration d'une ancienne version
 * si supportée") — crée TOUJOURS une NOUVELLE version dont le contenu copie celui restauré, jamais
 * un rollback destructif : l'historique n'est jamais réécrit, même en cas de restauration
 * multiple.
 */
@Injectable()
export class RestoreKnowledgeVersionUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_ENTRY_VERSION_REPOSITORY) private readonly knowledgeEntryVersionRepository: KnowledgeEntryVersionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: RestoreKnowledgeVersionCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Update);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }
    await assertKnowledgeEntryClientAccess(this.assertClientAccessUseCase, { organizationId: command.organizationId, entry, actorId: command.actorId, actorRole: command.actorRole, permission: ClientPermission.ManageKnowledge });

    const target = await this.knowledgeEntryVersionRepository.findByVersionNumber(command);
    if (!target) {
      throw new KnowledgeEntryVersionNotFoundError();
    }

    const occurredAt = this.clock.now();
    entry.updateMetadata(
      {
        title: target.snapshot.title,
        description: target.snapshot.description,
        category: parseKnowledgeCategory(target.snapshot.category),
        language: target.snapshot.language,
        metadata: target.snapshot.metadata,
      },
      command.actorId,
      occurredAt,
    );
    const version = KnowledgeEntryVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeEntryId: entry.id,
      versionNumber: entry.activeVersionNumber,
      reason: `Restauration de la version ${target.versionNumber}`,
      snapshot: target.snapshot,
      createdByUserId: command.actorId,
      occurredAt,
    });

    // Correctif audit Codex P1 (résiduel — même motif que Update/Validate/Archive/Restore
    // d'entrée) : l'entrée (nouveau `activeVersionNumber`) ET la nouvelle version qu'elle
    // représente, avec l'audit et l'Outbox, sont écrits DANS LA MÊME transaction — jamais un
    // `activeVersionNumber` incrémenté sans sa ligne de version correspondante.
    await this.knowledgeEntryRepository.updateWithNewVersion({
      entry,
      version,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.version_restored",
        resourceType: "knowledge_entry",
        resourceId: entry.id,
        requestId: command.requestId,
        metadata: { restoredFromVersion: target.versionNumber, newVersion: entry.activeVersionNumber },
      },
      outboxEvents: [
        {
          eventType: "KnowledgeVersionCreated",
          aggregateType: "KnowledgeEntry",
          aggregateId: entry.id,
          payload: { versionNumber: entry.activeVersionNumber, reason: `Restauration de la version ${target.versionNumber}` },
          occurredAt,
        },
      ],
    });

    return toKnowledgeEntrySummary(entry, [], 0);
  }
}
