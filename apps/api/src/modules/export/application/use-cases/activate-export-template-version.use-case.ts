import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ExportPermissionMissingError, ExportTemplateVersionNotFoundError } from "../../domain/errors";
import { ExportPermission, roleHasExportPermission } from "../../domain/export-permission";
import { toExportTemplateVersionSummary, type ExportTemplateVersionSummary } from "../dtos";
import { EXPORT_TEMPLATE_REPOSITORY, type ExportTemplateRepository } from "../ports/export-template.repository";

export type ActivateExportTemplateVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  exportTemplateId: string;
  versionId: string;
}>;

/** Mission Sprint 8A §7/§16 — activation atomique (archive l'éventuelle version ACTIVE + active la
 *  nouvelle dans la même transaction courte, côté repository). */
@Injectable()
export class ActivateExportTemplateVersionUseCase {
  constructor(
    @Inject(EXPORT_TEMPLATE_REPOSITORY) private readonly exportTemplateRepository: ExportTemplateRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivateExportTemplateVersionCommand): Promise<ExportTemplateVersionSummary> {
    if (!roleHasExportPermission(command.actorRole, ExportPermission.ManageExportTemplates)) {
      throw new ExportPermissionMissingError();
    }

    const version = await this.exportTemplateRepository.findVersionById({ organizationId: command.organizationId, versionId: command.versionId });
    if (!version || version.exportTemplateId !== command.exportTemplateId) {
      throw new ExportTemplateVersionNotFoundError();
    }

    const activated = await this.exportTemplateRepository.activateAtomically({
      organizationId: command.organizationId,
      exportTemplateId: command.exportTemplateId,
      versionId: command.versionId,
      occurredAt: this.clock.now(),
    });

    return toExportTemplateVersionSummary(activated);
  }
}
