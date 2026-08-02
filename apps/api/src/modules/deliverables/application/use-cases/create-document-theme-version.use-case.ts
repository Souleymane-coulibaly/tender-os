import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { validateDocumentThemeConfig } from "../../domain/document-theme-config";
import { DocumentThemeVersion } from "../../domain/document-theme-version.entity";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, DocumentThemeNotFoundError } from "../../domain/errors";
import { toDocumentThemeVersionSummary, type DocumentThemeVersionSummary } from "../dtos";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../ports/document-theme.repository";

export type CreateDocumentThemeVersionCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  documentThemeId: string;
  logoStorageKey?: string | undefined;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  config: unknown;
}>;

@Injectable()
export class CreateDocumentThemeVersionUseCase {
  constructor(
    @Inject(DOCUMENT_THEME_REPOSITORY) private readonly repository: DocumentThemeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDocumentThemeVersionCommand): Promise<DocumentThemeVersionSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDocumentThemes)) {
      throw new DeliverablePermissionMissingError();
    }

    const found = await this.repository.findById({ organizationId: command.organizationId, documentThemeId: command.documentThemeId });
    if (!found) {
      throw new DocumentThemeNotFoundError();
    }

    const existingVersions = await this.repository.listVersions({ organizationId: command.organizationId, documentThemeId: command.documentThemeId });
    const nextVersionNumber = existingVersions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
    const config = validateDocumentThemeConfig(command.config);

    const version = DocumentThemeVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      documentThemeId: command.documentThemeId,
      version: nextVersionNumber,
      logoStorageKey: command.logoStorageKey,
      accentColor: command.accentColor,
      fontFamily: command.fontFamily,
      config,
      createdBy: command.createdBy,
      occurredAt: this.clock.now(),
    });

    await this.repository.createVersion(version);

    return toDocumentThemeVersionSummary(version);
  }
}
