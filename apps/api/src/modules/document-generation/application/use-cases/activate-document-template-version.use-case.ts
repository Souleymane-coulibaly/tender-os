import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "../../domain/document-generation-permission";
import { DocumentGenerationPermissionMissingError, DocumentTemplateVersionNotFoundError } from "../../domain/errors";
import { toDocumentTemplateVersionSummary, type DocumentTemplateVersionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DOCUMENT_TEMPLATE_REPOSITORY, type DocumentTemplateRepository } from "../ports/document-template.repository";

export type ActivateDocumentTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  documentTemplateId: string;
  versionId: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class ActivateDocumentTemplateVersionUseCase {
  constructor(
    @Inject(DOCUMENT_TEMPLATE_REPOSITORY) private readonly templateRepository: DocumentTemplateRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivateDocumentTemplateVersionCommand): Promise<DocumentTemplateVersionSummary> {
    if (!roleHasDocumentGenerationPermission(command.actorRole, DocumentGenerationPermission.ManageTemplates)) {
      throw new DocumentGenerationPermissionMissingError();
    }

    const version = await this.templateRepository.findVersionById({ organizationId: command.organizationId, versionId: command.versionId });
    if (!version || version.documentTemplateId !== command.documentTemplateId) {
      throw new DocumentTemplateVersionNotFoundError();
    }

    // Valide la transition (DRAFT -> ACTIVE) au niveau domaine avant l'écriture atomique —
    // détecte une tentative invalide (ex. déjà ARCHIVED) avec un message clair plutôt qu'un
    // conflit d'index partiel opaque.
    version.activate(this.clock.now());

    const activated = await this.templateRepository.activateAtomically({
      organizationId: command.organizationId,
      documentTemplateId: command.documentTemplateId,
      versionId: command.versionId,
      occurredAt: this.clock.now(),
    });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "document_generation.template_version_activated",
      resourceType: "document_template_version",
      resourceId: activated.id,
      requestId: command.requestId,
      metadata: { documentTemplateId: command.documentTemplateId, version: activated.version },
    });

    return toDocumentTemplateVersionSummary(activated);
  }
}
