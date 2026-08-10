import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { ClientPermission } from "../../../client-portfolio";
import {
  CreateDocumentWithFirstVersionUseCase,
  DocumentDomain,
  DocumentOrigin,
  DOCUMENT_VERSION_REPOSITORY,
  InternalDocumentCleanupService,
  STORAGE_PROVIDER,
  type DocumentVersionRepository,
  type StorageProvider,
} from "../../../documents";
import {
  DocumentTemplate,
  DocumentTemplateScope,
  DocumentTemplateVersion,
  DOCUMENT_TEMPLATE_REPOSITORY,
  FieldType,
  type DiscoveredPlaceholder,
  type DocumentTemplateFieldMapping,
  type DocumentTemplateRepository,
} from "../../../document-generation";
import { extractBodyXml, extractOutline, insertPlaceholdersForSections, joinBody, rebuildDocxWithBody, splitBody } from "../../infrastructure/docx-outline-extractor";
import { buildTenderOsSystemMemoTemplate } from "../../infrastructure/system-template-builder";
import { TechnicalMemoTemplateOrigin } from "../../domain/enums";
import type { TechnicalMemo } from "../../domain/technical-memo.aggregate";
import type { TechnicalMemoSection } from "../../domain/technical-memo-section.entity";
import { assertTechnicalMemoAccess } from "../policies/technical-memo-access.policy";
import { TechnicalMemoAccessService } from "../services/technical-memo-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TECHNICAL_MEMO_REPOSITORY, type TechnicalMemoRepository } from "../ports/technical-memo.repository";
import { TECHNICAL_MEMO_SECTION_REPOSITORY, type TechnicalMemoSectionRepository } from "../ports/technical-memo-section.repository";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_TEMPLATE_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type PrepareTechnicalMemoTemplateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  technicalMemoId: string;
  requestId?: string | undefined;
}>;

export type PrepareTechnicalMemoTemplateResult = Readonly<{ memo: TechnicalMemo; sections: readonly TechnicalMemoSection[] }>;

/**
 * Étape 2 du pipeline (mission §2 "...→ Mapping exigences/connaissances → ... → Document-generation
 * Sprint 10 → DOCX final éditable") — prépare le gabarit dérivé EXPLOITABLE par `document-generation`
 * (Sprint 10) : insère un placeholder `{{sectionKey}}` juste après chaque titre détecté (jamais une
 * modification du contenu original, mission §13), enregistre le résultat comme un
 * `DocumentTemplate`/`DocumentTemplateVersion` DÉDIÉ à CE mémoire (jamais réutilisable entre
 * Tenders — un nom unique par mémoire garantit l'unicité `(organizationId, name)`), et l'ACTIVE
 * immédiatement (processus interne auto-géré, aucune revue humaine de bibliothèque ici,
 * contrairement au flux public `document-generation`). Idempotent : un mémoire déjà préparé
 * (`documentTemplateId` déjà renseigné) retourne l'état existant sans rien recréer.
 *
 * Re-extrait l'outline à partir du MÊME buffer original (déterministe) plutôt que de persister
 * `segmentIndex` sur `TechnicalMemoSection` — l'ordre de l'outline est stable et correspond
 * exactement à `TechnicalMemoSection.order` (les deux sont dérivés du même passage d'analyse).
 *
 * Correctif audit (réserve Codex, round GO-avec-réserves) — le stockage du fichier dérivé (écriture
 * S3/disque non transactionnelle) est effectué EN PREMIER, puis TOUTES les écritures Postgres
 * restantes (`DocumentTemplate`, `DocumentTemplateVersion`, activation, rattachement du mémo, audit)
 * sont regroupées dans UNE SEULE transaction courte : si l'une d'elles échoue, aucune ligne
 * `DocumentTemplate` orpheline ne peut jamais exister (elle n'est créée qu'à l'intérieur de cette
 * même transaction, jamais avant). Si la transaction elle-même échoue APRÈS que le fichier a été
 * stocké avec succès, le `Document` fraîchement créé est nettoyé via
 * `InternalDocumentCleanupService.purgeJustCreatedDocument` — même motif de compensation que
 * `DocumentGenerationExecutionService.run()` (Sprint 10/11), jamais un artefact de stockage orphelin
 * qu'aucune ligne DB ne référence.
 */
@Injectable()
export class PrepareTechnicalMemoTemplateUseCase {
  constructor(
    @Inject(TECHNICAL_MEMO_REPOSITORY) private readonly technicalMemoRepository: TechnicalMemoRepository,
    @Inject(TECHNICAL_MEMO_SECTION_REPOSITORY) private readonly sectionRepository: TechnicalMemoSectionRepository,
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly documentTemplateRepository: DocumentTemplateRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: TechnicalMemoAccessService,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly internalDocumentCleanupService: InternalDocumentCleanupService,
  ) {}

  async execute(command: PrepareTechnicalMemoTemplateCommand): Promise<PrepareTechnicalMemoTemplateResult> {
    const memo = await assertTechnicalMemoAccess(this.accessService, {
      organizationId: command.organizationId,
      technicalMemoId: command.technicalMemoId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageTechnicalMemo,
      requireUseOrgPermission: true,
    });

    const sections = await this.sectionRepository.listByMemoId({ organizationId: command.organizationId, technicalMemoId: memo.id });

    if (memo.documentTemplateId) {
      return { memo, sections };
    }

    const originalBuffer =
      memo.templateOrigin === TechnicalMemoTemplateOrigin.TenderOsSystem
        ? await buildTenderOsSystemMemoTemplate()
        : await this.readOriginalBuffer({ organizationId: command.organizationId, documentId: memo.originalDocumentId!, versionId: memo.originalDocumentVersionId! });

    const bodyXml = extractBodyXml(originalBuffer);
    const segments = splitBody(bodyXml);
    const freshOutline = extractOutline(segments);

    if (freshOutline.length !== sections.length) {
      throw new Error("Structural analysis mismatch — the original template changed since it was first analyzed.");
    }

    const orderedSections = [...sections].sort((a, b) => a.order - b.order);
    const placements = orderedSections.map((section, index) => ({ segmentIndex: freshOutline[index]!.segmentIndex, fieldKey: section.sectionKey }));
    const workingSegments = insertPlaceholdersForSections(segments, placements);

    const modifiedBuffer = rebuildDocxWithBody(originalBuffer, joinBody(workingSegments));
    const occurredAt = this.clock.now();
    const documentTemplateId = this.idGenerator.generate();

    // Écriture de stockage NON transactionnelle EN PREMIER — aucune ligne Postgres n'est créée
    // avant que ce fichier existe réellement (voir le commentaire de classe : jamais un
    // `DocumentTemplate` orphelin si le stockage échoue).
    const stored = await this.createDocumentWithFirstVersionUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      title: `Mémoire technique — gabarit préparé (${memo.id})`,
      origin: DocumentOrigin.Generated,
      domain: DocumentDomain.Template,
      file: { buffer: modifiedBuffer, originalFilename: `memoire-technique-${memo.id}.docx`, mimeType: DOCX_MIME_TYPE },
      maxFileSizeBytes: MAX_TEMPLATE_FILE_SIZE_BYTES,
      requestId: command.requestId,
    });

    const fieldMappings: readonly DocumentTemplateFieldMapping[] = orderedSections.map((section) => ({
      fieldKey: section.sectionKey,
      label: section.title,
      fieldType: FieldType.Multiline,
      required: false,
    }));
    const discoveredPlaceholders: readonly DiscoveredPlaceholder[] = orderedSections.map((section) => ({ fieldKey: section.sectionKey, occurrences: 1 }));

    const versionId = this.idGenerator.generate();

    try {
      await this.atomicTransactionRunner.run(async () => {
        const template = DocumentTemplate.create({
          id: documentTemplateId,
          organizationId: command.organizationId,
          scope: DocumentTemplateScope.Organization,
          name: `Mémoire technique — ${memo.tenderId} — ${memo.id}`,
          description: "Gabarit dérivé généré automatiquement — usage interne exclusif à ce mémoire technique.",
          createdBy: command.actorId,
          occurredAt,
        });
        await this.documentTemplateRepository.create(template);

        const version = DocumentTemplateVersion.create({
          id: versionId,
          organizationId: command.organizationId,
          documentTemplateId,
          version: 1,
          sourceDocumentId: stored.id,
          sourceDocumentVersionId: stored.currentVersion!.id,
          sourceChecksum: stored.currentVersion!.checksum,
          discoveredPlaceholders,
          allowPartialGeneration: true,
          fieldMappings,
          createdBy: command.actorId,
          occurredAt,
        });
        await this.documentTemplateRepository.createVersion({ version, fieldMappings });
        await this.documentTemplateRepository.activateAtomically({ organizationId: command.organizationId, documentTemplateId, versionId, occurredAt });

        memo.attachDocumentTemplate({ documentTemplateId, occurredAt });
        await this.technicalMemoRepository.save(memo);

        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "technical_memo.template_prepared",
          resourceType: "technical_memo",
          resourceId: memo.id,
          requestId: command.requestId,
          metadata: { documentTemplateId, sectionCount: sections.length },
        });
      });
    } catch (error) {
      // Le fichier a été stocké avec succès AVANT la transaction — jamais un artefact orphelin
      // qu'aucune ligne DB ne référence si les écritures Postgres échouent après coup (même motif
      // de compensation que `DocumentGenerationExecutionService.run()`).
      await this.internalDocumentCleanupService.purgeJustCreatedDocument({ organizationId: command.organizationId, documentId: stored.id });
      throw error;
    }

    return { memo, sections };
  }

  private async readOriginalBuffer(input: { organizationId: string; documentId: string; versionId: string }): Promise<Buffer> {
    const version = await this.documentVersionRepository.findById({ organizationId: input.organizationId, documentId: input.documentId, versionId: input.versionId });
    if (!version) {
      throw new Error("Original technical memo template document version not found.");
    }
    const stream = await this.storageProvider.openReadStream(version.storageKey);
    return readStreamToBuffer(stream);
  }
}
