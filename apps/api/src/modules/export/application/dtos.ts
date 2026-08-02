import type { ExportArtifact, ExportManifest } from "../domain/export-artifact";
import type { ExportJob } from "../domain/export-job.aggregate";
import type { ExportTemplate } from "../domain/export-template.aggregate";
import type { ExportTemplateVersion } from "../domain/export-template-version.entity";

export type ExportTemplateVersionSummary = {
  id: string;
  exportTemplateId: string;
  version: number;
  status: string;
  format: string;
  config: unknown;
  createdBy: string;
  createdAt: string;
  activatedAt?: string | undefined;
  archivedAt?: string | undefined;
};

export type ExportTemplateSummary = {
  id: string;
  organizationId: string;
  documentType: string;
  name: string;
  description?: string | undefined;
  createdBy: string;
  createdAt: string;
  activeVersion?: ExportTemplateVersionSummary | undefined;
  versions?: readonly ExportTemplateVersionSummary[] | undefined;
};

export function toExportTemplateVersionSummary(version: ExportTemplateVersion): ExportTemplateVersionSummary {
  return {
    id: version.id,
    exportTemplateId: version.exportTemplateId,
    version: version.version,
    status: version.status,
    format: version.format,
    config: version.config,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString(),
    archivedAt: version.archivedAt?.toISOString(),
  };
}

export function toExportTemplateSummary(
  template: ExportTemplate,
  options?: { activeVersion?: ExportTemplateVersion | undefined; versions?: readonly ExportTemplateVersion[] | undefined },
): ExportTemplateSummary {
  return {
    id: template.id,
    organizationId: template.organizationId,
    documentType: template.documentType,
    name: template.name,
    description: template.description,
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    activeVersion: options?.activeVersion ? toExportTemplateVersionSummary(options.activeVersion) : undefined,
    versions: options?.versions?.map(toExportTemplateVersionSummary),
  };
}

export type ExportArtifactSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileHash: string;
  hashAlgorithm: string;
  manifest: ExportManifest;
  warnings: readonly string[];
  errors: readonly string[];
  createdAt: string;
};

export function toExportArtifactSummary(artifact: ExportArtifact): ExportArtifactSummary {
  return {
    id: artifact.id,
    fileName: artifact.fileName,
    mimeType: artifact.mimeType,
    fileSize: artifact.fileSize,
    fileHash: artifact.fileHash,
    hashAlgorithm: artifact.hashAlgorithm,
    manifest: artifact.manifest,
    warnings: artifact.warnings,
    errors: artifact.errors,
    createdAt: artifact.createdAt.toISOString(),
  };
}

export type ExportJobSummary = {
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
  basedOnExportJobId?: string | undefined;
  createdBy: string;
  createdAt: string;
  completedAt?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  artifact?: ExportArtifactSummary | undefined;
};

export function toExportJobSummary(job: ExportJob, artifact?: ExportArtifact | undefined): ExportJobSummary {
  return {
    id: job.id,
    organizationId: job.organizationId,
    clientAccountId: job.clientAccountId,
    tenderId: job.tenderId,
    exportTemplateId: job.exportTemplateId,
    exportTemplateVersionId: job.exportTemplateVersionId,
    documentType: job.documentType,
    mode: job.mode,
    format: job.format,
    status: job.status,
    version: job.version,
    basedOnExportJobId: job.basedOnExportJobId,
    createdBy: job.createdBy,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    artifact: artifact ? toExportArtifactSummary(artifact) : undefined,
  };
}
