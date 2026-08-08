import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntry } from "../../domain/knowledge-entry.aggregate";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { KnowledgeSourceType } from "../../domain/knowledge-source-type";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { validateKnowledgeMetadata } from "../schemas/metadata/metadata-validator";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "./get-or-create-default-knowledge-space.use-case";

export type CreateKnowledgeEntryCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  category: string;
  language?: string | undefined;
  metadata?: unknown;
  tags?: readonly string[] | undefined;
  /** Mission Sprint 5.1 §"Knowledge Base" — absent/undefined crée une entrée GLOBALE (organisation),
   *  une valeur crée une entrée SPÉCIFIQUE à ce client (existence + accès + non-archivé vérifiés ici,
   *  jamais confiance en une valeur fournie par le client sans validation). */
  clientAccountId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Création manuelle d'une entrée de connaissance (mission Sprint 5 §2) — jamais de document
 * associé au départ (`sourceType: MANUAL`), immédiatement `READY`. Crée la version 1 dans le même
 * mouvement (mission §10 "version de l'entrée" — jamais une entrée sans au moins une version).
 */
@Injectable()
export class CreateKnowledgeEntryUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getOrCreateDefaultKnowledgeSpaceUseCase: GetOrCreateDefaultKnowledgeSpaceUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateKnowledgeEntryCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Create);

    if (command.clientAccountId) {
      const client = await this.getClientAccountUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
      });
      if (client.status === "ARCHIVED") {
        throw new ClientAccountArchivedError();
      }
      await this.assertClientAccessUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        permission: ClientPermission.ManageKnowledge,
      });
    }

    const category = parseKnowledgeCategory(command.category);
    const metadata = validateKnowledgeMetadata(category, command.metadata);
    const space = await this.getOrCreateDefaultKnowledgeSpaceUseCase.getOrCreate(command.organizationId);
    const occurredAt = this.clock.now();

    const entry = KnowledgeEntry.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeSpaceId: space.id,
      clientAccountId: command.clientAccountId,
      title: command.title,
      description: command.description,
      category,
      sourceType: KnowledgeSourceType.Manual,
      language: command.language,
      metadata,
      createdByUserId: command.actorId,
      occurredAt,
    });

    const version = KnowledgeEntryVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      knowledgeEntryId: entry.id,
      versionNumber: 1,
      reason: "Création manuelle",
      snapshot: { title: entry.title, description: entry.description, category: entry.category, language: entry.language, metadata: entry.metadata },
      createdByUserId: command.actorId,
      occurredAt,
    });

    // Correction audit Codex "Anomalie 2" + "Corrections Sprint 5" (atomicité audit/mutation) —
    // entrée + version 1 + tags + entrée d'audit écrits DANS LA MÊME transaction (voir
    // `PrismaKnowledgeEntryRepository.createWithVersionAndTags`) : jamais une entrée ou une
    // version résiduelle si la résolution/association d'un tag échoue en cours de route, jamais un
    // tag créé inutilement si la transaction est annulée, et jamais une entrée créée sans sa trace
    // d'audit correspondante (ni l'inverse).
    const { tags } = await this.knowledgeEntryRepository.createWithVersionAndTags({
      entry,
      version,
      tagLabels: (command.tags ?? []).map((rawLabel) => ({ label: rawLabel, displayLabel: rawLabel.trim() })),
      occurredAt,
      auditEntry: {
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "knowledge_entry.created",
        resourceType: "knowledge_entry",
        resourceId: entry.id,
        requestId: command.requestId,
        metadata: { category, sourceType: KnowledgeSourceType.Manual, clientAccountId: command.clientAccountId },
      },
      outboxEvents: [
        {
          eventType: "KnowledgeEntryCreated",
          aggregateType: "KnowledgeEntry",
          aggregateId: entry.id,
          payload: { category, sourceType: KnowledgeSourceType.Manual, clientAccountId: command.clientAccountId ?? null },
          occurredAt,
        },
      ],
    });

    return toKnowledgeEntrySummary(entry, tags, 0);
  }
}
