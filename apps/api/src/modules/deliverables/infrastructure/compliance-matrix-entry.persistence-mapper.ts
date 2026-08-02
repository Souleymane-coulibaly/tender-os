import { ComplianceMatrixEntry } from "../domain/compliance-matrix-entry.aggregate";
import type { ComplianceCoverageStatus, Criticality } from "../domain/compliance-coverage-status";

export type PersistedComplianceMatrixEntry = {
  id: string;
  organizationId: string;
  deliverableId: string;
  requirementId: string | null;
  source: string;
  mandatory: boolean;
  criticality: string;
  response: string | null;
  deliverableSectionRef: string | null;
  proofReference: string | null;
  coverageStatus: string;
  validated: boolean;
  validatedBy: string | null;
  validatedAt: Date | null;
  order: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainComplianceMatrixEntry(record: PersistedComplianceMatrixEntry): ComplianceMatrixEntry {
  return ComplianceMatrixEntry.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    deliverableId: record.deliverableId,
    requirementId: record.requirementId ?? undefined,
    source: record.source,
    mandatory: record.mandatory,
    criticality: record.criticality as Criticality,
    response: record.response ?? undefined,
    deliverableSectionRef: record.deliverableSectionRef ?? undefined,
    proofReference: record.proofReference ?? undefined,
    coverageStatus: record.coverageStatus as ComplianceCoverageStatus,
    validated: record.validated,
    validatedBy: record.validatedBy ?? undefined,
    validatedAt: record.validatedAt ?? undefined,
    order: record.order,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toComplianceMatrixEntryRow(entry: ComplianceMatrixEntry) {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    deliverableId: entry.deliverableId,
    requirementId: entry.requirementId ?? null,
    source: entry.source,
    mandatory: entry.mandatory,
    criticality: entry.criticality,
    response: entry.response ?? null,
    deliverableSectionRef: entry.deliverableSectionRef ?? null,
    proofReference: entry.proofReference ?? null,
    coverageStatus: entry.coverageStatus,
    validated: entry.validated,
    validatedBy: entry.validatedBy ?? null,
    validatedAt: entry.validatedAt ?? null,
    order: entry.order,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}
