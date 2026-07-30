import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { KnowledgeEntryNotFoundError } from "../../domain/errors";
import { parseKnowledgeCategory } from "../../domain/knowledge-category";
import { KnowledgeEntryVersion } from "../../domain/knowledge-entry-version.entity";
import { KnowledgePermission } from "../../domain/knowledge-permission";
import { assertHasKnowledgePermission } from "../policies/knowledge-authorization.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { KNOWLEDGE_DOCUMENT_REPOSITORY, type KnowledgeDocumentRepository } from "../ports/knowledge-document.repository";
import { KNOWLEDGE_ENTRY_REPOSITORY, type KnowledgeEntryRepository } from "../ports/knowledge-entry.repository";
import { KNOWLEDGE_ENTRY_VERSION_REPOSITORY, type KnowledgeEntryVersionRepository } from "../ports/knowledge-entry-version.repository";
import { KNOWLEDGE_TAG_REPOSITORY, type KnowledgeTagRepository } from "../ports/knowledge-tag.repository";
import { validateKnowledgeMetadata } from "../schemas/metadata/metadata-validator";
import { toKnowledgeEntrySummary, type KnowledgeEntrySummary } from "../dtos";

export type UpdateKnowledgeEntryCommand = Readonly<{
  organizationId: string;
  knowledgeEntryId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  category?: string | undefined;
  language?: string | undefined;
  metadata?: unknown;
  requestId?: string | undefined;
}>;

/**
 * Mise à jour des métadonnées (mission Sprint 5 §10 "modification substantielle des métadonnées")
 * — crée TOUJOURS une nouvelle version quand cette méthode est invoquée (une seule version par
 * appel, jamais une par champ) : c'est à l'appelant (contrôleur) de ne PAS invoquer ce use case
 * pour un simple ajout/retrait de tag, qui passe par `AddKnowledgeTagUseCase`/
 * `RemoveKnowledgeTagUseCase` sans jamais toucher la version (mission §"éviter que chaque
 * changement mineur de tag produise une version lourde").
 */
@Injectable()
export class UpdateKnowledgeEntryUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENTRY_REPOSITORY) private readonly knowledgeEntryRepository: KnowledgeEntryRepository,
    @Inject(KNOWLEDGE_ENTRY_VERSION_REPOSITORY) private readonly knowledgeEntryVersionRepository: KnowledgeEntryVersionRepository,
    @Inject(KNOWLEDGE_TAG_REPOSITORY) private readonly knowledgeTagRepository: KnowledgeTagRepository,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY) private readonly knowledgeDocumentRepository: KnowledgeDocumentRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: UpdateKnowledgeEntryCommand): Promise<KnowledgeEntrySummary> {
    assertHasKnowledgePermission(command.actorRole, KnowledgePermission.Update);

    const entry = await this.knowledgeEntryRepository.findById(command);
    if (!entry) {
      throw new KnowledgeEntryNotFoundError();
    }

    const category = command.category !== undefined ? parseKnowledgeCategory(command.category) : undefined;
    const resolvedCategory = category ?? entry.category;
    const metadata = command.metadata !== undefined ? validateKnowledgeMetadata(resolvedCategory, command.metadata) : undefined;

    const occurredAt = this.clock.now();
    entry.updateMetadata({ title: command.title, description: command.description, category, language: command.language, metadata }, command.actorId, occurredAt);
    await this.knowledgeEntryRepository.save(entry);

    await this.knowledgeEntryVersionRepository.create(
      KnowledgeEntryVersion.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        knowledgeEntryId: entry.id,
        versionNumber: entry.activeVersionNumber,
        reason: "Métadonnées mises à jour",
        snapshot: { title: entry.title, description: entry.description, category: entry.category, language: entry.language, metadata: entry.metadata },
        createdByUserId: command.actorId,
        occurredAt,
      }),
    );

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "knowledge_entry.updated",
      resourceType: "knowledge_entry",
      resourceId: entry.id,
      requestId: command.requestId,
      metadata: { newVersion: entry.activeVersionNumber },
    });

    const [tags, documents] = await Promise.all([
      this.knowledgeTagRepository.listByEntryId(command),
      this.knowledgeDocumentRepository.listByEntryId(command),
    ]);
    return toKnowledgeEntrySummary(entry, tags, documents.length);
  }
}
