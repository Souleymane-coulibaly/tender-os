import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ExportPermissionMissingError, ExportTemplateNotFoundError } from "../../domain/errors";
import type { ExportFormat } from "../../domain/export-format";
import { ExportPermission, roleHasExportPermission } from "../../domain/export-permission";
import { validateExportTemplateConfig } from "../../domain/export-template-config";
import { ExportTemplateVersion } from "../../domain/export-template-version.entity";
import { toExportTemplateVersionSummary, type ExportTemplateVersionSummary } from "../dtos";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";

export type CreateExportTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  exportTemplateId: string;
  format: ExportFormat;
  config: unknown;
}>;

@Injectable()
export class CreateExportTemplateVersionUseCase {
  constructor(
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateExportTemplateVersionCommand): Promise<ExportTemplateVersionSummary> {
    if (!roleHasExportPermission(command.actorRole, ExportPermission.ManageExportTemplates)) {
      throw new ExportPermissionMissingError();
    }

    const found = await this.exportTemplateRepository.findById({ organizationId: command.organizationId, exportTemplateId: command.exportTemplateId });
    if (!found) {
      throw new ExportTemplateNotFoundError();
    }

    const existingVersions = await this.exportTemplateRepository.listVersions({
      organizationId: command.organizationId,
      exportTemplateId: command.exportTemplateId,
    });
    const nextVersionNumber = existingVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const config = validateExportTemplateConfig(command.config);

    const version = ExportTemplateVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      exportTemplateId: command.exportTemplateId,
      version: nextVersionNumber,
      format: command.format,
      config,
      createdBy: command.createdBy,
      occurredAt: this.clock.now(),
    });

    await this.exportTemplateRepository.createVersion(version);

    return toExportTemplateVersionSummary(version);
  }
}
