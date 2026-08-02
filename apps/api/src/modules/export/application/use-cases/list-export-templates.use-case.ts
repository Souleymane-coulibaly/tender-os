import { Inject, Injectable } from "@nestjs/common";
import { ExportPermissionMissingError } from "../../domain/errors";
import { ExportPermission, roleHasExportPermission } from "../../domain/export-permission";
import { toExportTemplateSummary, type ExportTemplateSummary } from "../dtos";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";

export type ListExportTemplatesQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListExportTemplatesUseCase {
  constructor(@Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository) {}

  async execute(query: ListExportTemplatesQuery): Promise<readonly ExportTemplateSummary[]> {
    if (!roleHasExportPermission(query.actorRole, ExportPermission.ReadExportTemplates)) {
      throw new ExportPermissionMissingError();
    }
    const templates = await this.exportTemplateRepository.list({ organizationId: query.organizationId });
    return templates.map(({ template, activeVersion }) => toExportTemplateSummary(template, { activeVersion }));
  }
}
