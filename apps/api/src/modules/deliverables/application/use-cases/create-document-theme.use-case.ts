import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { validateDocumentThemeConfig } from "../../domain/document-theme-config";
import { DocumentTheme } from "../../domain/document-theme.aggregate";
import { DocumentThemeVersion } from "../../domain/document-theme-version.entity";
import { DeliverablePermission, roleHasDeliverablePermission } from "../../domain/deliverable-permission";
import { DeliverablePermissionMissingError, SystemScopeNotTenantCreatableError } from "../../domain/errors";
import { isTenantCreatableScopeLevel, type ScopeLevel } from "../../domain/scope-level";
import { toDocumentThemeSummary, type DocumentThemeSummary } from "../dtos";
import { DOCUMENT_THEME_REPOSITORY, type DocumentThemeRepository } from "../ports/document-theme.repository";

export type CreateDocumentThemeCommand = Readonly<{
  organizationId: string;
  actorRole: string;
  createdBy: string;
  scopeLevel: ScopeLevel;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  name: string;
  logoStorageKey?: string | undefined;
  accentColor?: string | undefined;
  fontFamily?: string | undefined;
  config: unknown;
}>;

/** Mission Sprint 8A.1 §6/§17 — gestion de l'identité documentaire réservée à OWNER/ORGANIZATION_ADMIN. */
@Injectable()
export class CreateDocumentThemeUseCase {
  constructor(
    @Inject(DOCUMENT_THEME_REPOSITORY) private readonly repository: DocumentThemeRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: CreateDocumentThemeCommand): Promise<DocumentThemeSummary> {
    if (!roleHasDeliverablePermission(command.actorRole, DeliverablePermission.ManageDocumentThemes)) {
      throw new DeliverablePermissionMissingError();
    }
    // Correctif audit Codex P1-004 — même garde que pour les templates.
    if (!isTenantCreatableScopeLevel(command.scopeLevel)) {
      throw new SystemScopeNotTenantCreatableError();
    }

    const config = validateDocumentThemeConfig(command.config);
    const occurredAt = this.clock.now();

    const theme = DocumentTheme.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      scopeLevel: command.scopeLevel,
      clientAccountId: command.clientAccountId,
      tenderId: command.tenderId,
      name: command.name,
      createdBy: command.createdBy,
      occurredAt,
    });

    const version = DocumentThemeVersion.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      documentThemeId: theme.id,
      version: 1,
      logoStorageKey: command.logoStorageKey,
      accentColor: command.accentColor,
      fontFamily: command.fontFamily,
      config,
      createdBy: command.createdBy,
      occurredAt,
    });

    await this.repository.createWithFirstVersion({ theme, version });

    return toDocumentThemeSummary(theme, { versions: [version] });
  }
}
