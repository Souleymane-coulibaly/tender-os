import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { DocumentTemplate } from "../domain/document-template.aggregate";
import type { DocumentTemplateScope } from "../domain/document-template-scope";
import type { DocumentTemplateFieldMapping } from "../domain/document-template-field-mapping";
import { DocumentTemplateVersion, type DiscoveredPlaceholder } from "../domain/document-template-version.entity";
import type { DocumentTemplateVersionStatus } from "../domain/document-template-version-status";
import type { FieldType } from "../domain/field-type";

type DocumentTemplateRow = {
  id: string;
  organizationId: string;
  scope: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  archivedAt: Date | null;
};

type DocumentTemplateVersionRow = {
  id: string;
  organizationId: string;
  documentTemplateId: string;
  version: number;
  status: string;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  sourceChecksum: string;
  discoveredPlaceholders: Prisma.JsonValue;
  allowPartialGeneration: boolean;
  createdBy: string;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
};

type DocumentTemplateFieldMappingRow = {
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  formatOptions: Prisma.JsonValue;
};

export function toDomainTemplate(record: DocumentTemplateRow): DocumentTemplate {
  return DocumentTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    scope: record.scope as DocumentTemplateScope,
    name: record.name,
    description: record.description ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt ?? undefined,
  });
}

function toDomainFieldMapping(row: DocumentTemplateFieldMappingRow): DocumentTemplateFieldMapping {
  return {
    fieldKey: row.fieldKey,
    label: row.label,
    fieldType: row.fieldType as FieldType,
    required: row.required,
    formatOptions: (row.formatOptions as Record<string, unknown> | null) ?? undefined,
  };
}

export function toDomainTemplateVersion(record: DocumentTemplateVersionRow, fieldMappingRows: readonly DocumentTemplateFieldMappingRow[]): DocumentTemplateVersion {
  return DocumentTemplateVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    documentTemplateId: record.documentTemplateId,
    version: record.version,
    status: record.status as DocumentTemplateVersionStatus,
    sourceDocumentId: record.sourceDocumentId,
    sourceDocumentVersionId: record.sourceDocumentVersionId,
    sourceChecksum: record.sourceChecksum,
    discoveredPlaceholders: (record.discoveredPlaceholders as unknown as DiscoveredPlaceholder[]) ?? [],
    allowPartialGeneration: record.allowPartialGeneration,
    fieldMappings: fieldMappingRows.map(toDomainFieldMapping),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
  });
}

export function toVersionRow(version: DocumentTemplateVersion): Prisma.DocumentTemplateVersionUncheckedCreateInput {
  return {
    id: version.id,
    organizationId: version.organizationId,
    documentTemplateId: version.documentTemplateId,
    version: version.version,
    status: version.status,
    sourceDocumentId: version.sourceDocumentId,
    sourceDocumentVersionId: version.sourceDocumentVersionId,
    sourceChecksum: version.sourceChecksum,
    discoveredPlaceholders: version.discoveredPlaceholders as unknown as Prisma.InputJsonValue,
    allowPartialGeneration: version.allowPartialGeneration,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    activatedAt: version.activatedAt ?? null,
    archivedAt: version.archivedAt ?? null,
  };
}

export function toFieldMappingRows(input: { documentTemplateVersionId: string; organizationId: string; mappings: readonly DocumentTemplateFieldMapping[] }): Prisma.DocumentTemplateFieldMappingUncheckedCreateInput[] {
  return input.mappings.map((mapping) => ({
    id: randomUUID(),
    organizationId: input.organizationId,
    documentTemplateVersionId: input.documentTemplateVersionId,
    fieldKey: mapping.fieldKey,
    label: mapping.label,
    fieldType: mapping.fieldType,
    required: mapping.required,
    ...(mapping.formatOptions ? { formatOptions: mapping.formatOptions as Prisma.InputJsonValue } : {}),
  }));
}
