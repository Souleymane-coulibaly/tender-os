import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { DuplicateExportTemplateError, ExportPermissionMissingError } from "../../domain/errors";
import type { ExportDocumentType } from "../../domain/export-document-type";
import type { ExportFormat } from "../../domain/export-format";
import { ExportPermission, roleHasExportPermission } from "../../domain/export-permission";
import { validateExportTemplateConfig } from "../../domain/export-template-config";
import { ExportTemplate } from "../../domain/export-template.aggregate";
import { ExportTemplateVersion } from "../../domain/export-template-version.entity";
import { toExportTemplateSummary, type ExportTemplateSummary } from "../dtos";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";

export type CreateExportTemplateCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  documentType: ExportDocumentType;
  name: string;
  description?: string | undefined;
  format: ExportFormat;
  config: unknown;
}>;

/** Mission Sprint 8A §16/§56 — gestion des templates réservée à OWNER/ORGANIZATION_ADMIN, jamais
 *  délégable via un rôle client (`ExportPermission.ManageExportTemplates`). Crée le template ET sa
 *  première version (DRAFT) atomiquement, même motif que `CreatePromptTemplateUseCase` +
 *  `CreatePromptVersionUseCase` combinés en une seule opération pour la version 1. */
@Injectable()
export class CreateExportTemplateUseCase {
  constructor(
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateExportTemplateCommand): Promise<ExportTemplateSummary> {
    if (!roleHasExportPermission(command.actorRole, ExportPermission.ManageExportTemplates)) {
      throw new ExportPermissionMissingError();
    }

    const existing = await this.exportTemplateRepository.findByDocumentTypeAndName({
      organizationId: command.organizationId,
      documentType: command.documentType,
      name: command.name,
    });
    if (existing) {
      throw new DuplicateExportTemplateError();
    }

    const config = validateExportTemplateConfig(command.config);
    const occurredAt = this.clock.now();

    const template = ExportTemplate.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      documentType: command.documentType,
      name: command.name,
      description: command.description,
      createdBy: command.createdBy,
      occurredAt,
    });

    const version = ExportTemplateVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      exportTemplateId: template.id,
      version: 1,
      format: command.format,
      config,
      createdBy: command.createdBy,
      occurredAt,
    });

    await this.exportTemplateRepository.createWithFirstVersion({ template, version });

    return toExportTemplateSummary(template, { versions: [version] });
  }
}
