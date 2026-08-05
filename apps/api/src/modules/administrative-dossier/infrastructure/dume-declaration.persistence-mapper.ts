import { DumeDeclaration } from "../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../domain/dume-declaration-version.entity";
import type { StructuredCapacityStatement } from "../domain/structured-capacity-statement";

export type PersistedDumeDeclaration = {
  id: string;
  organizationId: string;
  tenderId: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainDumeDeclaration(record: PersistedDumeDeclaration): DumeDeclaration {
  return DumeDeclaration.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    currentVersionNumber: record.currentVersionNumber,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toDumeDeclarationRow(declaration: DumeDeclaration) {
  return {
    id: declaration.id,
    organizationId: declaration.organizationId,
    tenderId: declaration.tenderId,
    currentVersionNumber: declaration.currentVersionNumber,
    createdBy: declaration.createdBy,
    createdAt: declaration.createdAt,
    updatedAt: declaration.updatedAt,
  };
}

export type PersistedDumeDeclarationVersion = {
  id: string;
  organizationId: string;
  dumeDeclarationId: string;
  version: number;
  data: unknown;
  createdBy: string;
  createdAt: Date;
};

export function toDomainDumeDeclarationVersion(record: PersistedDumeDeclarationVersion): DumeDeclarationVersion {
  return DumeDeclarationVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    dumeDeclarationId: record.dumeDeclarationId,
    version: record.version,
    data: record.data as StructuredCapacityStatement,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toDumeDeclarationVersionRow(version: DumeDeclarationVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    dumeDeclarationId: version.dumeDeclarationId,
    version: version.version,
    data: version.data as unknown as object,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  };
}
