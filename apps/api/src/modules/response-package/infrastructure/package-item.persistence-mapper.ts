import { Prisma } from "@prisma/client";
import type { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType, PackageItemStatus } from "../domain/enums";
import { PackageItem } from "../domain/package-item.entity";

type PackageItemRow = {
  id: string;
  organizationId: string;
  responsePackageVersionId: string;
  category: string;
  label: string;
  documentType: string | null;
  sourceType: string;
  sourceId: string | null;
  documentId: string | null;
  documentVersionId: string | null;
  requirementType: string;
  applicabilityStatus: string;
  conditionText: string | null;
  status: string;
  lotId: string | null;
  expiresAt: Date | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainPackageItem(record: PackageItemRow): PackageItem {
  return PackageItem.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    responsePackageVersionId: record.responsePackageVersionId,
    category: record.category as PackageItemCategory,
    label: record.label,
    documentType: record.documentType ?? undefined,
    sourceType: record.sourceType as PackageItemSourceType,
    sourceId: record.sourceId ?? undefined,
    documentId: record.documentId ?? undefined,
    documentVersionId: record.documentVersionId ?? undefined,
    requirementType: record.requirementType as PackageItemRequirementType,
    applicabilityStatus: record.applicabilityStatus as PackageItemApplicabilityStatus,
    conditionText: record.conditionText ?? undefined,
    status: record.status as PackageItemStatus,
    lotId: record.lotId ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPackageItemRow(item: PackageItem) {
  return {
    id: item.id,
    organizationId: item.organizationId,
    responsePackageVersionId: item.responsePackageVersionId,
    category: item.category,
    label: item.label,
    documentType: item.documentType ?? null,
    sourceType: item.sourceType,
    sourceId: item.sourceId ?? null,
    documentId: item.documentId ?? null,
    documentVersionId: item.documentVersionId ?? null,
    requirementType: item.requirementType,
    applicabilityStatus: item.applicabilityStatus,
    conditionText: item.conditionText ?? null,
    status: item.status,
    lotId: item.lotId ?? null,
    expiresAt: item.expiresAt ?? null,
    metadata: item.metadata as Prisma.InputJsonValue,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
