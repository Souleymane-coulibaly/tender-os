import type { ExportDocumentType } from "../domain/export-document-type";
import type { ExportFormat } from "../domain/export-format";
import type { ExportTemplateConfig } from "../domain/export-template-config";
import { ExportTemplate } from "../domain/export-template.aggregate";
import { ExportTemplateVersion } from "../domain/export-template-version.entity";
import type { ExportTemplateVersionStatus } from "../domain/export-template-version-status";

export type PersistedExportTemplate = {
  id: string;
  organizationId: string;
  documentType: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
};

export type PersistedExportTemplateVersion = {
  id: string;
  organizationId: string;
  exportTemplateId: string;
  version: number;
  status: string;
  format: string;
  config: unknown;
  createdBy: string;
  createdAt: Date;
  activatedAt: Date | null;
  archivedAt: Date | null;
};

export function toDomainTemplate(record: PersistedExportTemplate): ExportTemplate {
  return ExportTemplate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    documentType: record.documentType as ExportDocumentType,
    name: record.name,
    description: record.description ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toDomainTemplateVersion(record: PersistedExportTemplateVersion): ExportTemplateVersion {
  return ExportTemplateVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    exportTemplateId: record.exportTemplateId,
    version: record.version,
    status: record.status as ExportTemplateVersionStatus,
    format: record.format as ExportFormat,
    config: record.config as ExportTemplateConfig,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    activatedAt: record.activatedAt ?? undefined,
    archivedAt: record.archivedAt ?? undefined,
  });
}
