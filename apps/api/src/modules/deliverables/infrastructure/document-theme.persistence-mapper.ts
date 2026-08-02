import type { Prisma } from "@prisma/client";
import type { DocumentThemeConfig } from "../domain/document-theme-config";
import { DocumentTheme } from "../domain/document-theme.aggregate";
import { DocumentThemeVersion } from "../domain/document-theme-version.entity";
import type { ScopeLevel } from "../domain/scope-level";
import type { VersionLifecycleStatus } from "../domain/version-lifecycle-status";

export type PersistedDocumentTheme = {
  id: string;
  organizationId: string;
  scopeLevel: string;
  clientAccountId: string | null;
  tenderId: string | null;
  name: string;
  createdBy: string;
  createdAt: Date;
};

export type PersistedDocumentThemeVersion = {
  id: string;
  organizationId: string;
  documentThemeId: string;
  version: number;
  status: string;
  logoStorageKey: string | null;
  accentColor: string | null;
  fontFamily: string | null;
  config: unknown;
  createdBy: string;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
};

export function toDomainTheme(record: PersistedDocumentTheme): DocumentTheme {
  return DocumentTheme.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    scopeLevel: record.scopeLevel as ScopeLevel,
    clientAccountId: record.clientAccountId ?? undefined,
    tenderId: record.tenderId ?? undefined,
    name: record.name,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toThemeRow(theme: DocumentTheme) {
  return {
    id: theme.id,
    organizationId: theme.organizationId,
    scopeLevel: theme.scopeLevel,
    clientAccountId: theme.clientAccountId ?? null,
    tenderId: theme.tenderId ?? null,
    name: theme.name,
    createdBy: theme.createdBy,
    createdAt: theme.createdAt,
  };
}

export function toDomainThemeVersion(record: PersistedDocumentThemeVersion): DocumentThemeVersion {
  return DocumentThemeVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    documentThemeId: record.documentThemeId,
    version: record.version,
    status: record.status as VersionLifecycleStatus,
    logoStorageKey: record.logoStorageKey ?? undefined,
    accentColor: record.accentColor ?? undefined,
    fontFamily: record.fontFamily ?? undefined,
    config: record.config as DocumentThemeConfig,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
  });
}

export function toThemeVersionRow(version: DocumentThemeVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    documentThemeId: version.documentThemeId,
    version: version.version,
    status: version.status,
    logoStorageKey: version.logoStorageKey ?? null,
    accentColor: version.accentColor ?? null,
    fontFamily: version.fontFamily ?? null,
    config: version.config as unknown as Prisma.InputJsonValue,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    activatedAt: version.activatedAt ?? null,
    archivedAt: version.archivedAt ?? null,
  };
}
