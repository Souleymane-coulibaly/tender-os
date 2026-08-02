import { Inject, Injectable } from "@nestjs/common";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError } from "../../domain/errors";
import { toDocumentThemeSummary, type DocumentThemeSummary } from "../dtos";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../ports/document-theme.repository";

export type ListDocumentThemesQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListDocumentThemesUseCase {
  constructor(@Inject(DOCUMENT_THEME_REPOSITORY) private readonly repository: DocumentThemeRepository) {}

  async execute(query: ListDocumentThemesQuery): Promise<readonly DocumentThemeSummary[]> {
    if (!roleHasDeliverablePermission(query.actorRole, DeliverablePermission.ManageDocumentThemes)) {
      throw new DeliverablePermissionMissingError();
    }
    const themes = await this.repository.list({ organizationId: query.organizationId });
    return themes.map(({ theme, activeVersion }) => toDocumentThemeSummary(theme, { activeVersion }));
  }
}
