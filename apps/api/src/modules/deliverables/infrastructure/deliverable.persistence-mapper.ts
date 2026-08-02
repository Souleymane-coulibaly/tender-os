import { Deliverable } from "../domain/deliverable.aggregate";
import type { DeliverableStatus } from "../domain/deliverable-status";
import type { DeliverableType } from "../domain/deliverable-type";
import type { ScopeLevel } from "../domain/scope-level";

export type PersistedDeliverable = {
  id: string;
  organizationId: string;
  clientAccountId: string;
  tenderId: string;
  type: string;
  status: string;
  templateVersionId: string | null;
  templateSourceLevel: string | null;
  themeVersionId: string | null;
  themeSourceLevel: string | null;
  themeSelectedBy: string | null;
  themeSelectedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  costReportPricingEstimateId: string | null;
  costReportPricingEstimateVersionNumber: number | null;
  costReportSelectedBy: string | null;
  costReportSelectedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainDeliverable(record: PersistedDeliverable): Deliverable {
  return Deliverable.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId,
    tenderId: record.tenderId,
    type: record.type as DeliverableType,
    status: record.status as DeliverableStatus,
    templateVersionId: record.templateVersionId ?? undefined,
    templateSourceLevel: (record.templateSourceLevel as ScopeLevel | null) ?? undefined,
    themeVersionId: record.themeVersionId ?? undefined,
    themeSourceLevel: (record.themeSourceLevel as ScopeLevel | null) ?? undefined,
    themeSelectedBy: record.themeSelectedBy ?? undefined,
    themeSelectedAt: record.themeSelectedAt ?? undefined,
    approvedBy: record.approvedBy ?? undefined,
    approvedAt: record.approvedAt ?? undefined,
    costReportPricingEstimateId: record.costReportPricingEstimateId ?? undefined,
    costReportPricingEstimateVersionNumber: record.costReportPricingEstimateVersionNumber ?? undefined,
    costReportSelectedBy: record.costReportSelectedBy ?? undefined,
    costReportSelectedAt: record.costReportSelectedAt ?? undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toDeliverableRow(deliverable: Deliverable) {
  return {
    id: deliverable.id,
    organizationId: deliverable.organizationId,
    clientAccountId: deliverable.clientAccountId,
    tenderId: deliverable.tenderId,
    type: deliverable.type,
    status: deliverable.status,
    templateVersionId: deliverable.templateVersionId ?? null,
    templateSourceLevel: deliverable.templateSourceLevel ?? null,
    themeVersionId: deliverable.themeVersionId ?? null,
    themeSourceLevel: deliverable.themeSourceLevel ?? null,
    themeSelectedBy: deliverable.themeSelectedBy ?? null,
    themeSelectedAt: deliverable.themeSelectedAt ?? null,
    approvedBy: deliverable.approvedBy ?? null,
    approvedAt: deliverable.approvedAt ?? null,
    costReportPricingEstimateId: deliverable.costReportPricingEstimateId ?? null,
    costReportPricingEstimateVersionNumber: deliverable.costReportPricingEstimateVersionNumber ?? null,
    costReportSelectedBy: deliverable.costReportSelectedBy ?? null,
    costReportSelectedAt: deliverable.costReportSelectedAt ?? null,
    createdBy: deliverable.createdBy,
    createdAt: deliverable.createdAt,
    updatedAt: deliverable.updatedAt,
  };
}
