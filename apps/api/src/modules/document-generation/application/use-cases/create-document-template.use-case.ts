import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { DocumentTemplate } from "../../domain/document-template.aggregate";
import type { DocumentTemplateScope } from "../../domain/document-template-scope";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "../../domain/document-generation-permission";
import { DocumentGenerationPermissionMissingError, DuplicateDocumentTemplateNameError } from "../../domain/errors";
import { toDocumentTemplateSummary, type DocumentTemplateSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";

export type CreateDocumentTemplateCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  scope: DocumentTemplateScope;
  name: string;
  description?: string | undefined;
  requestId?: string | undefined;
}>;

/** Gestion des templates réservée à OWNER/ORGANIZATION_ADMIN, jamais délégable via un rôle client
 *  (mission §"Scope Template limité à SYSTEM/ORGANIZATION") — même palier qu'`ExportPermission.
 *  ManageExportTemplates`. Crée l'identité seule (SANS fichier) : la première version, avec le
 *  fichier .docx réel, se crée séparément (`CreateDocumentTemplateVersionUseCase`) — un upload
 *  multipart n'a pas à transiter par cette étape. */
@Injectable()
export class CreateDocumentTemplateUseCase {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDocumentTemplateCommand): Promise<DocumentTemplateSummary> {
    if (!roleHasDocumentGenerationPermission(command.actorRole, DocumentGenerationPermission.ManageTemplates)) {
      throw new DocumentGenerationPermissionMissingError();
    }

    const existing = await this.templateRepository.findByName({ organizationId: command.organizationId, name: command.name });
    if (existing) {
      throw new DuplicateDocumentTemplateNameError();
    }

    const template = DocumentTemplate.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      scope: command.scope,
      name: command.name,
      description: command.description,
      createdBy: command.actorId,
      occurredAt: this.clock.now(),
    });

    await this.templateRepository.create(template);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document_generation.template_created",
      resourceType: "document_template",
      resourceId: template.id,
      requestId: command.requestId,
      metadata: { scope: command.scope, name: command.name },
    });

    return toDocumentTemplateSummary(template);
  }
}
