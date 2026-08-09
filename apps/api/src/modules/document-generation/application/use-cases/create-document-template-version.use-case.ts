import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { CreateDocumentWithFirstVersionUseCase, DocumentDomain, DocumentOrigin, type IncomingFile } from "../../../documents";
import { validateFieldMapping } from "../../domain/document-template-field-mapping";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "../../domain/document-generation-permission";
import { DocumentTemplateNotFoundError, DocumentGenerationPermissionMissingError } from "../../domain/errors";
import { DocumentTemplateVersion } from "../../domain/document-template-version.entity";
import { toDocumentTemplateVersionSummary, type DocumentTemplateVersionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCX_MERGE_ENGINE, type DocxMergeEngine } from "../ports/docx-merge-engine";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";
import { TEMPLATE_UPLOAD_VALIDATOR, type TemplateUploadValidator } from "../ports/template-upload-validator";

const MAX_TEMPLATE_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export type CreateDocumentTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  documentTemplateId: string;
  file: IncomingFile;
  fieldMappings: readonly unknown[];
  allowPartialGeneration: boolean;
  requestId?: string | undefined;
}>;

/**
 * Crée une NOUVELLE version DRAFT (mission "ne jamais modifier template.docx en place — toute
 * évolution crée une nouvelle version, jamais une réécriture"). Ordre des opérations : (1)
 * validation de sécurité du fichier AVANT tout stockage (mission "jamais un fichier dangereux même
 * transitoirement persisté"), (2) détection des placeholders réels (parseur OOXML, split-run-safe),
 * (3) validation de la Field Mapping fournie contre CES placeholders réellement détectés — jamais
 * une correspondance supposée, (4) stockage du fichier via le module Documents existant (aucun
 * second stockage), (5) persistance de la version + ses mappings.
 */
@Injectable()
export class CreateDocumentTemplateVersionUseCase {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(TEMPLATE_UPLOAD_VALIDATOR) private readonly templateUploadValidator: TemplateUploadValidator,
    @Inject(DOCX_MERGE_ENGINE) private readonly mergeEngine: DocxMergeEngine,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
  ) {}

  async execute(command: CreateDocumentTemplateVersionCommand): Promise<DocumentTemplateVersionSummary> {
    if (!roleHasDocumentGenerationPermission(command.actorRole, DocumentGenerationPermission.ManageTemplates)) {
      throw new DocumentGenerationPermissionMissingError();
    }

    const found = await this.templateRepository.findById({ organizationId: command.organizationId, documentTemplateId: command.documentTemplateId });
    if (!found) {
      throw new DocumentTemplateNotFoundError();
    }

    await this.templateUploadValidator.validate({ buffer: command.file.buffer, originalFilename: command.file.originalFilename, mimeType: command.file.mimeType });

    const discoveredPlaceholders = this.mergeEngine.scanPlaceholders(command.file.buffer);
    const discoveredKeys = new Set(discoveredPlaceholders.map((p) => p.fieldKey));

    const fieldMappings = command.fieldMappings.map((raw) => {
      const mapping = validateFieldMapping(raw);
      if (!discoveredKeys.has(mapping.fieldKey)) {
        throw new Error(`Field mapping "${mapping.fieldKey}" does not correspond to any placeholder actually found in the template.`);
      }
      return mapping;
    });

    const occurredAt = this.clock.now();

    const storedFile = await this.createDocumentWithFirstVersionUseCase.execute({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      title: `${found.template.name} — source`,
      origin: DocumentOrigin.Template,
      domain: DocumentDomain.Template,
      file: command.file,
      maxFileSizeBytes: MAX_TEMPLATE_FILE_SIZE_BYTES,
      requestId: command.requestId,
    });

    const nextVersionNumber = await this.templateRepository.nextVersionNumber({ organizationId: command.organizationId, documentTemplateId: command.documentTemplateId });

    const version = DocumentTemplateVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      documentTemplateId: command.documentTemplateId,
      version: nextVersionNumber,
      sourceDocumentId: storedFile.id,
      sourceDocumentVersionId: storedFile.currentVersion!.id,
      sourceChecksum: storedFile.currentVersion!.checksum,
      discoveredPlaceholders,
      allowPartialGeneration: command.allowPartialGeneration,
      fieldMappings,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.templateRepository.createVersion({ version, fieldMappings });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document_generation.template_version_created",
      resourceType: "document_template_version",
      resourceId: version.id,
      requestId: command.requestId,
      metadata: { documentTemplateId: command.documentTemplateId, version: nextVersionNumber, placeholderCount: discoveredPlaceholders.length },
    });

    return toDocumentTemplateVersionSummary(version);
  }
}
