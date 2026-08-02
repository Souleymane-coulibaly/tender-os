import { ExportArtifact, type ExportManifest } from "../domain/export-artifact";
import type { ExportFormat } from "../domain/export-format";
import { ExportJob } from "../domain/export-job.aggregate";
import type { ExportMode } from "../domain/export-mode";
import { ExportSectionSelection, type ExportSectionValidationStatus } from "../domain/export-section-selection";
import type { ExportSectionSource } from "../domain/export-section-source";
import type { ExportStatus } from "../domain/export-status";

export type PersistedExportSection = {
  sectionId: string;
  taskType: string | null;
  sourceType: string;
  generationId: string | null;
  pricingEstimateId: string | null;
  pricingEstimateVersionNumber: number | null;
  manualContent: string | null;
  validationStatus: string;
  selectedBy: string;
  selectedAt: Date;
  order: number;
  notes: string | null;
};

export type PersistedExportJob = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  exportTemplateId: string;
  exportTemplateVersionId: string;
  documentType: string;
  mode: string;
  format: string;
  status: string;
  version: number;
  basedOnExportJobId: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  sections: readonly PersistedExportSection[];
};

export type PersistedExportArtifact = {
  id: string;
  organizationId: string;
  exportJobId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  hashAlgorithm: string;
  storageKey: string;
  manifestJson: unknown;
  warnings: unknown;
  errors: unknown;
  createdAt: Date;
};

export function toDomainSection(record: PersistedExportSection): ExportSectionSelection {
  return ExportSectionSelection.create({
    sectionId: record.sectionId,
    taskType: record.taskType ?? undefined,
    sourceType: record.sourceType as ExportSectionSource,
    generationId: record.generationId ?? undefined,
    pricingEstimateId: record.pricingEstimateId ?? undefined,
    pricingEstimateVersionNumber: record.pricingEstimateVersionNumber ?? undefined,
    manualContent: record.manualContent ?? undefined,
    validationStatus: record.validationStatus as ExportSectionValidationStatus,
    selectedBy: record.selectedBy,
    selectedAt: record.selectedAt,
    order: record.order,
    notes: record.notes ?? undefined,
  });
}

export function toDomainJob(record: PersistedExportJob): ExportJob {
  return ExportJob.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    exportTemplateId: record.exportTemplateId,
    exportTemplateVersionId: record.exportTemplateVersionId,
    documentType: record.documentType,
    mode: record.mode as ExportMode,
    format: record.format as ExportFormat,
    status: record.status as ExportStatus,
    version: record.version,
    basedOnExportJobId: record.basedOnExportJobId ?? undefined,
    sections: record.sections.map(toDomainSection),
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? undefined,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
  });
}

export function toDomainArtifact(record: PersistedExportArtifact): ExportArtifact {
  return ExportArtifact.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    exportJobId: record.exportJobId,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    fileHash: record.fileHash,
    hashAlgorithm: record.hashAlgorithm,
    storageKey: record.storageKey,
    manifest: record.manifestJson as ExportManifest,
    warnings: (record.warnings as string[] | null) ?? [],
    errors: (record.errors as string[] | null) ?? [],
    createdAt: record.createdAt,
  });
}
