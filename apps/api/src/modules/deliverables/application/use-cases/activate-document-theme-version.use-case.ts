import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, DocumentThemeVersionNotFoundError } from "../../domain/errors";
import { toDocumentThemeVersionSummary, type DocumentThemeVersionSummary } from "../dtos";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../ports/document-theme.repository";

export type ActivateDocumentThemeVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  documentThemeId: string;
  versionId: string;
}>;

@Injectable()
export class ActivateDocumentThemeVersionUseCase {
  constructor(
    @Inject(DOCUMENT_THEME_REPOSITORY) private readonly repository: DocumentThemeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: ActivateDocumentThemeVersionCommand): Promise<DocumentThemeVersionSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDocumentThemes)) {
      throw new DeliverablePermissionMissingError();
    }

    const version = await this.repository.findVersionById({ organizationId: command.organizationId, versionId: command.versionId });
    if (!version || version.documentThemeId !== command.documentThemeId) {
      throw new DocumentThemeVersionNotFoundError();
    }

    const activated = await this.repository.activateAtomically({
      organizationId: command.organizationId,
      documentThemeId: command.documentThemeId,
      versionId: command.versionId,
      occurredAt: this.clock.now(),
    });

    return toDocumentThemeVersionSummary(activated);
  }
}
