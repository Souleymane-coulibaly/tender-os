import { Dc2Declaration } from "../domain/dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "../domain/dc2-declaration-version.entity";
import type { StructuredCapacityStatement } from "../domain/structured-capacity-statement";

export type PersistedDc2Declaration = {
  id: string;
  organizationId: string;
  tenderId: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainDc2Declaration(record: PersistedDc2Declaration): Dc2Declaration {
  return Dc2Declaration.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    currentVersionNumber: record.currentVersionNumber,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toDc2DeclarationRow(declaration: Dc2Declaration) {
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

export type PersistedDc2DeclarationVersion = {
  id: string;
  organizationId: string;
  dc2DeclarationId: string;
  version: number;
  data: unknown;
  createdBy: string;
  createdAt: Date;
};

export function toDomainDc2DeclarationVersion(record: PersistedDc2DeclarationVersion): Dc2DeclarationVersion {
  return Dc2DeclarationVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    dc2DeclarationId: record.dc2DeclarationId,
    version: record.version,
    data: record.data as StructuredCapacityStatement,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toDc2DeclarationVersionRow(version: Dc2DeclarationVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    dc2DeclarationId: version.dc2DeclarationId,
    version: version.version,
    data: version.data as unknown as object,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
  };
}
