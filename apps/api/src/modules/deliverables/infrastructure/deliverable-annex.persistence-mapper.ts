import { DeliverableAnnex } from "../domain/deliverable-annex.aggregate";
import type { AnnexStatus } from "../domain/annex-status";

export type PersistedDeliverableAnnex = {
  id: string;
  organizationId: string;
  deliverableId: string;
  label: string;
  source: string | null;
  documentId: string | null;
  version: string | null;
  documentVersionId: string | null;
  documentChecksum: string | null;
  documentFileName: string | null;
  documentMimeType: string | null;
  status: string;
  order: number;
  createdBy: string;
  createdAt: Date;
};

export function toDomainAnnex(record: PersistedDeliverableAnnex): DeliverableAnnex {
  return DeliverableAnnex.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableId: record.deliverableId,
    label: record.label,
    source: record.source ?? undefined,
    documentId: record.documentId ?? undefined,
    version: record.version ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    documentChecksum: record.documentChecksum ?? undefined,
    documentFileName: record.documentFileName ?? undefined,
    documentMimeType: record.documentMimeType ?? undefined,
    status: record.status as AnnexStatus,
    order: record.order,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
  });
}

export function toAnnexRow(annex: DeliverableAnnex) {
  return {
    id: annex.id,
    organizationId: annex.organizationId,
    deliverableId: annex.deliverableId,
    label: annex.label,
    source: annex.source ?? null,
    documentId: annex.documentId ?? null,
    version: annex.version ?? null,
    documentVersionId: annex.documentVersionId ?? null,
    documentChecksum: annex.documentChecksum ?? null,
    documentFileName: annex.documentFileName ?? null,
    documentMimeType: annex.documentMimeType ?? null,
    status: annex.status,
    order: annex.order,
    createdBy: annex.createdBy,
    createdAt: annex.createdAt,
  };
}
