import type { Prisma } from "@prisma/client";
import type { FieldProvenanceEntry } from "../domain/field-provenance";
import { GeneratedDocumentRevision } from "../domain/generated-document-revision.entity";
import type { GeneratedDocumentRevisionStatus } from "../domain/generated-document-revision-status";
import { GeneratedDocument } from "../domain/generated-document.aggregate";
import type { ReviewStatus } from "../domain/review-status";

type GeneratedDocumentRow = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  documentTemplateId: string;
  title: string;
  createdBy: string;
  createdAt: Date;
};

type GeneratedDocumentRevisionRow = {
  id: string;
  organizationId: string;
  generatedDocumentId: string;
  revisionNumber: number;
  previousRevisionId: string | null;
  documentTemplateVersionId: string;
  status: string;
  dataSnapshot: Prisma.JsonValue;
  provenance: Prisma.JsonValue;
  missingFields: Prisma.JsonValue;
  reviewStatus: string;
  artifactDocumentId: string | null;
  artifactDocumentVersionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
};

export function toDomainGeneratedDocument(record: GeneratedDocumentRow): GeneratedDocument {
  return GeneratedDocument.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    documentTemplateId: record.documentTemplateId,
    title: record.title,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toDomainRevision(record: GeneratedDocumentRevisionRow): GeneratedDocumentRevision {
  return GeneratedDocumentRevision.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    generatedDocumentId: record.generatedDocumentId,
    revisionNumber: record.revisionNumber,
    previousRevisionId: record.previousRevisionId ?? undefined,
    documentTemplateVersionId: record.documentTemplateVersionId,
    status: record.status as GeneratedDocumentRevisionStatus,
    dataSnapshot: (record.dataSnapshot as Record<string, unknown>) ?? {},
    provenance: (record.provenance as unknown as FieldProvenanceEntry[]) ?? [],
    missingFields: (record.missingFields as unknown as string[]) ?? [],
    reviewStatus: record.reviewStatus as ReviewStatus,
    artifactDocumentId: record.artifactDocumentId ?? undefined,
    artifactDocumentVersionId: record.artifactDocumentVersionId ?? undefined,
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? undefined,
  });
}

export function toRevisionRow(revision: GeneratedDocumentRevision): Prisma.GeneratedDocumentRevisionUncheckedCreateInput {
  return {
    id: revision.id,
    organizationId: revision.organizationId,
    generatedDocumentId: revision.generatedDocumentId,
    revisionNumber: revision.revisionNumber,
    previousRevisionId: revision.previousRevisionId ?? null,
    documentTemplateVersionId: revision.documentTemplateVersionId,
    status: revision.status,
    dataSnapshot: revision.dataSnapshot as Prisma.InputJsonValue,
    provenance: revision.provenance as unknown as Prisma.InputJsonValue,
    missingFields: revision.missingFields as unknown as Prisma.InputJsonValue,
    reviewStatus: revision.reviewStatus,
    artifactDocumentId: revision.artifactDocumentId ?? null,
    artifactDocumentVersionId: revision.artifactDocumentVersionId ?? null,
    errorCode: revision.errorCode ?? null,
    errorMessage: revision.errorMessage ?? null,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
    completedAt: revision.completedAt ?? null,
  };
}
