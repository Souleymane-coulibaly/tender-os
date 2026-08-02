import { ChecklistPieceEntry } from "../domain/checklist-piece-entry.aggregate";
import type { ChecklistPieceStatus } from "../domain/checklist-piece-status";

export type PersistedChecklistPieceEntry = {
  id: string;
  organizationId: string;
  deliverableId: string;
  name: string;
  source: string | null;
  mandatory: boolean;
  format: string | null;
  documentId: string | null;
  version: string | null;
  documentVersionId: string | null;
  documentChecksum: string | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  expiresAt: Date | null;
  signatureRequired: boolean;
  status: string;
  responsibleUserId: string | null;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainChecklistPieceEntry(record: PersistedChecklistPieceEntry): ChecklistPieceEntry {
  return ChecklistPieceEntry.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableId: record.deliverableId,
    name: record.name,
    source: record.source ?? undefined,
    mandatory: record.mandatory,
    format: record.format ?? undefined,
    documentId: record.documentId ?? undefined,
    version: record.version ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    documentChecksum: record.documentChecksum ?? undefined,
    documentFileName: record.documentFileName ?? undefined,
    documentMimeType: record.documentMimeType ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    signatureRequired: record.signatureRequired,
    status: record.status as ChecklistPieceStatus,
    responsibleUserId: record.responsibleUserId ?? undefined,
    order: record.order,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toChecklistPieceEntryRow(entry: ChecklistPieceEntry) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    deliverableId: entry.deliverableId,
    name: entry.name,
    source: entry.source ?? null,
    mandatory: entry.mandatory,
    format: entry.format ?? null,
    documentId: entry.documentId ?? null,
    version: entry.version ?? null,
    documentVersionId: entry.documentVersionId ?? null,
    documentChecksum: entry.documentChecksum ?? null,
    documentFileName: entry.documentFileName ?? null,
    documentMimeType: entry.documentMimeType ?? null,
    expiresAt: entry.expiresAt ?? null,
    signatureRequired: entry.signatureRequired,
    status: entry.status,
    responsibleUserId: entry.responsibleUserId ?? null,
    order: entry.order,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
