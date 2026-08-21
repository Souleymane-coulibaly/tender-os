import { Prisma } from "@prisma/client";
import { AdministrativeDocumentRevision } from "../domain/administrative-document-revision.entity";
import type { AdministrativeDocumentRevisionStatus } from "../domain/administrative-document-revision-status";

export type PersistedAdministrativeDocumentRevision = {
  id: string;
  organizationId: string;
  administrativeDocumentId: string;
  revisionNumber: number;
  documentId: string | null;
  documentVersionId: string | null;
  documentChecksum: string | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  expiresAt: Date | null;
  status: string;
  notes: string | null;
  officialTemplateId: string | null;
  formDataSnapshot: unknown;
  candidateCompanyId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainAdministrativeDocumentRevision(record: PersistedAdministrativeDocumentRevision): AdministrativeDocumentRevision {
  return AdministrativeDocumentRevision.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    administrativeDocumentId: record.administrativeDocumentId,
    revisionNumber: record.revisionNumber,
    documentId: record.documentId ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    documentChecksum: record.documentChecksum ?? undefined,
    documentFileName: record.documentFileName ?? undefined,
    documentMimeType: record.documentMimeType ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    status: record.status as AdministrativeDocumentRevisionStatus,
    notes: record.notes ?? undefined,
    officialTemplateId: record.officialTemplateId ?? undefined,
    formDataSnapshot: (record.formDataSnapshot as Record<string, unknown> | null) ?? undefined,
    candidateCompanyId: record.candidateCompanyId ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toAdministrativeDocumentRevisionRow(revision: AdministrativeDocumentRevision) {
  return {
    id: revision.id,
    organizationId: revision.organizationId,
    administrativeDocumentId: revision.administrativeDocumentId,
    revisionNumber: revision.revisionNumber,
    documentId: revision.documentId ?? null,
    documentVersionId: revision.documentVersionId ?? null,
    documentChecksum: revision.documentChecksum ?? null,
    documentFileName: revision.documentFileName ?? null,
    documentMimeType: revision.documentMimeType ?? null,
    expiresAt: revision.expiresAt ?? null,
    status: revision.status,
    notes: revision.notes ?? null,
    officialTemplateId: revision.officialTemplateId ?? null,
    formDataSnapshot: revision.formDataSnapshot === undefined ? Prisma.JsonNull : (revision.formDataSnapshot as object),
    candidateCompanyId: revision.candidateCompanyId ?? null,
    createdBy: revision.createdBy,
    createdAt: revision.createdAt,
    updatedAt: revision.updatedAt,
  };
}
