import type { PricingScheduleVersionStatus } from "../domain/enums";
import { PricingScheduleVersion } from "../domain/pricing-schedule-version.entity";

type PricingScheduleVersionRow = {
  id: string;
  organizationId: string;
  pricingScheduleId: string;
  versionNumber: number;
  status: string;
  sourceDocumentVersionId: string;
  mappingVersion: number;
  createdBy: string;
  createdAt: Date;
  validatedBy: string | null;
  validatedAt: Date | null;
};

export function toDomainPricingScheduleVersion(record: PricingScheduleVersionRow): PricingScheduleVersion {
  return PricingScheduleVersion.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    pricingScheduleId: record.pricingScheduleId,
    versionNumber: record.versionNumber,
    status: record.status as PricingScheduleVersionStatus,
    sourceDocumentVersionId: record.sourceDocumentVersionId,
    mappingVersion: record.mappingVersion,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    validatedBy: record.validatedBy ?? undefined,
    validatedAt: record.validatedAt ?? undefined,
  });
}

export function toPricingScheduleVersionRow(version: PricingScheduleVersion) {
  return {
    id: version.id,
    organizationId: version.organizationId,
    pricingScheduleId: version.pricingScheduleId,
    versionNumber: version.versionNumber,
    status: version.status,
    sourceDocumentVersionId: version.sourceDocumentVersionId,
    mappingVersion: version.mappingVersion,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    validatedBy: version.validatedBy ?? null,
    validatedAt: version.validatedAt ?? null,
  };
}
