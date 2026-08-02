import type { ChecklistPieceEntry } from "../domain/checklist-piece-entry.aggregate";
import type { ComplianceMatrixEntry } from "../domain/compliance-matrix-entry.aggregate";
import type { DeliverableAnnex } from "../domain/deliverable-annex.aggregate";

export type ComplianceMatrixEntrySummary = {
  id: string;
  deliverableId: string;
  requirementId?: string | undefined;
  source: string;
  mandatory: boolean;
  criticality: string;
  response?: string | undefined;
  deliverableSectionRef?: string | undefined;
  proofReference?: string | undefined;
  coverageStatus: string;
  validated: boolean;
  validatedBy?: string | undefined;
  validatedAt?: string | undefined;
  order: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toComplianceMatrixEntrySummary(entry: ComplianceMatrixEntry): ComplianceMatrixEntrySummary {
  return {
    id: entry.id,
    deliverableId: entry.deliverableId,
    requirementId: entry.requirementId,
    source: entry.source,
    mandatory: entry.mandatory,
    criticality: entry.criticality,
    response: entry.response,
    deliverableSectionRef: entry.deliverableSectionRef,
    proofReference: entry.proofReference,
    coverageStatus: entry.coverageStatus,
    validated: entry.validated,
    validatedBy: entry.validatedBy,
    validatedAt: entry.validatedAt?.toISOString(),
    order: entry.order,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export type ChecklistPieceEntrySummary = {
  id: string;
  deliverableId: string;
  name: string;
  source?: string | undefined;
  mandatory: boolean;
  format?: string | undefined;
  documentId?: string | undefined;
  version?: string | undefined;
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  expiresAt?: string | undefined;
  signatureRequired: boolean;
  status: string;
  responsibleUserId?: string | undefined;
  order: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export function toChecklistPieceEntrySummary(entry: ChecklistPieceEntry): ChecklistPieceEntrySummary {
  return {
    id: entry.id,
    deliverableId: entry.deliverableId,
    name: entry.name,
    source: entry.source,
    mandatory: entry.mandatory,
    format: entry.format,
    documentId: entry.documentId,
    version: entry.version,
    documentVersionId: entry.documentVersionId,
    documentChecksum: entry.documentChecksum,
    documentFileName: entry.documentFileName,
    documentMimeType: entry.documentMimeType,
    expiresAt: entry.expiresAt?.toISOString(),
    signatureRequired: entry.signatureRequired,
    status: entry.status,
    responsibleUserId: entry.responsibleUserId,
    order: entry.order,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export type DeliverableAnnexSummary = {
  id: string;
  deliverableId: string;
  label: string;
  source?: string | undefined;
  documentId?: string | undefined;
  version?: string | undefined;
  documentVersionId?: string | undefined;
  documentChecksum?: string | undefined;
  documentFileName?: string | undefined;
  documentMimeType?: string | undefined;
  status: string;
  order: number;
  createdBy: string;
  createdAt: string;
};

export function toDeliverableAnnexSummary(annex: DeliverableAnnex): DeliverableAnnexSummary {
  return {
    id: annex.id,
    deliverableId: annex.deliverableId,
    label: annex.label,
    source: annex.source,
    documentId: annex.documentId,
    version: annex.version,
    documentVersionId: annex.documentVersionId,
    documentChecksum: annex.documentChecksum,
    documentFileName: annex.documentFileName,
    documentMimeType: annex.documentMimeType,
    status: annex.status,
    order: annex.order,
    createdBy: annex.createdBy,
    createdAt: annex.createdAt.toISOString(),
  };
}
