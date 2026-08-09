import type { DiscoveredPlaceholder, DocumentTemplateVersion } from "../domain/document-template-version.entity";
import type { DocumentTemplateFieldMapping } from "../domain/document-template-field-mapping";
import type { DocumentTemplate } from "../domain/document-template.aggregate";
import type { FieldProvenanceEntry } from "../domain/field-provenance";
import type { GeneratedDocumentRevision } from "../domain/generated-document-revision.entity";
import type { GeneratedDocument } from "../domain/generated-document.aggregate";

export type DocumentTemplateFieldMappingSummary = DocumentTemplateFieldMapping;

export type DocumentTemplateVersionSummary = {
  id: string;
  documentTemplateId: string;
  version: number;
  status: string;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  sourceChecksum: string;
  discoveredPlaceholders: readonly DiscoveredPlaceholder[];
  allowPartialGeneration: boolean;
  fieldMappings: readonly DocumentTemplateFieldMappingSummary[];
  createdBy: string;
  createdAt: string;
  activatedAt?: string | undefined;
  archivedAt?: string | undefined;
};

export function toDocumentTemplateVersionSummary(version: DocumentTemplateVersion): DocumentTemplateVersionSummary {
  return {
    id: version.id,
    documentTemplateId: version.documentTemplateId,
    version: version.version,
    status: version.status,
    sourceDocumentId: version.sourceDocumentId,
    sourceDocumentVersionId: version.sourceDocumentVersionId,
    sourceChecksum: version.sourceChecksum,
    discoveredPlaceholders: version.discoveredPlaceholders,
    allowPartialGeneration: version.allowPartialGeneration,
    fieldMappings: version.fieldMappings,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    activatedAt: version.activatedAt?.toISOString(),
    archivedAt: version.archivedAt?.toISOString(),
  };
}

export type DocumentTemplateSummary = {
  id: string;
  organizationId: string;
  scope: string;
  name: string;
  description?: string | undefined;
  createdBy: string;
  createdAt: string;
  archivedAt?: string | undefined;
  activeVersion?: DocumentTemplateVersionSummary | undefined;
};

export function toDocumentTemplateSummary(template: DocumentTemplate, activeVersion?: DocumentTemplateVersion): DocumentTemplateSummary {
  return {
    id: template.id,
    organizationId: template.organizationId,
    scope: template.scope,
    name: template.name,
    description: template.description,
    createdBy: template.createdBy,
    createdAt: template.createdAt.toISOString(),
    archivedAt: template.archivedAt?.toISOString(),
    activeVersion: activeVersion ? toDocumentTemplateVersionSummary(activeVersion) : undefined,
  };
}

export type GeneratedDocumentRevisionSummary = {
  id: string;
  generatedDocumentId: string;
  revisionNumber: number;
  previousRevisionId?: string | undefined;
  documentTemplateVersionId: string;
  status: string;
  dataSnapshot: Readonly<Record<string, unknown>>;
  provenance: readonly FieldProvenanceEntry[];
  missingFields: readonly string[];
  reviewStatus: string;
  artifactDocumentId?: string | undefined;
  artifactDocumentVersionId?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  createdBy: string;
  createdAt: string;
  completedAt?: string | undefined;
};

export function toGeneratedDocumentRevisionSummary(revision: GeneratedDocumentRevision): GeneratedDocumentRevisionSummary {
  return {
    id: revision.id,
    generatedDocumentId: revision.generatedDocumentId,
    revisionNumber: revision.revisionNumber,
    previousRevisionId: revision.previousRevisionId,
    documentTemplateVersionId: revision.documentTemplateVersionId,
    status: revision.status,
    dataSnapshot: revision.dataSnapshot,
    provenance: revision.provenance,
    missingFields: revision.missingFields,
    reviewStatus: revision.reviewStatus,
    artifactDocumentId: revision.artifactDocumentId,
    artifactDocumentVersionId: revision.artifactDocumentVersionId,
    errorCode: revision.errorCode,
    errorMessage: revision.errorMessage,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt.toISOString(),
    completedAt: revision.completedAt?.toISOString(),
  };
}

export type GeneratedDocumentSummary = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  documentTemplateId: string;
  title: string;
  /** V2 Sprint 11B — voir `GeneratedDocument.subjectId` (domaine) : exposé pour que les appelants
   *  (ex. `administrative-dossier`) puissent filtrer une liste de lignées par opérateur, jamais un
   *  second endpoint dupliqué pour ça. */
  subjectId?: string | undefined;
  createdBy: string;
  createdAt: string;
  revisions?: readonly GeneratedDocumentRevisionSummary[] | undefined;
};

export function toGeneratedDocumentSummary(generatedDocument: GeneratedDocument, revisions?: readonly GeneratedDocumentRevision[]): GeneratedDocumentSummary {
  return {
    id: generatedDocument.id,
    organizationId: generatedDocument.organizationId,
    clientAccountId: generatedDocument.clientAccountId,
    tenderId: generatedDocument.tenderId,
    documentTemplateId: generatedDocument.documentTemplateId,
    title: generatedDocument.title,
    subjectId: generatedDocument.subjectId,
    createdBy: generatedDocument.createdBy,
    createdAt: generatedDocument.createdAt.toISOString(),
    revisions: revisions?.map(toGeneratedDocumentRevisionSummary),
  };
}
