import type { DocumentTheme } from "../../domain/document-theme.aggregate";
import type { DocumentThemeVersion } from "../../domain/document-theme-version.entity";
import type { ScopeLevel } from "../../domain/scope-level";

export type DocumentThemeWithVersions = { theme: DocumentTheme; activeVersion?: DocumentThemeVersion | undefined };

export interface DocumentThemeRepository {
  createWithFirstVersion(input: { theme: DocumentTheme; version: DocumentThemeVersion }): Promise<void>;
  findById(input: { organizationId: string; documentThemeId: string }): Promise<DocumentThemeWithVersions | null>;
  list(input: { organizationId: string }): Promise<readonly DocumentThemeWithVersions[]>;

  createVersion(version: DocumentThemeVersion): Promise<void>;
  findVersionById(input: { organizationId: string; versionId: string }): Promise<DocumentThemeVersion | null>;
  listVersions(input: { organizationId: string; documentThemeId: string }): Promise<readonly DocumentThemeVersion[]>;

  activateAtomically(input: { organizationId: string; documentThemeId: string; versionId: string; occurredAt: Date }): Promise<DocumentThemeVersion>;

  /** Mission §6 — même résolution de hiérarchie que les templates (TENDER > CLIENT > ORGANIZATION). */
  findActiveVersionForScope(input: {
    organizationId: string;
    scopeLevel: ScopeLevel;
    clientAccountId?: string | undefined;
    tenderId?: string | undefined;
  }): Promise<{ theme: DocumentTheme; version: DocumentThemeVersion } | null>;
}

export const DOCUMENT_THEME_REPOSITORY = Symbol("DOCUMENT_THEME_REPOSITORY");
