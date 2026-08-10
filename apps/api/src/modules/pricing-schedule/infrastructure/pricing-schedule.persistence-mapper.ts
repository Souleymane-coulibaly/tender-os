import type { FinancialDocumentType, PricingScheduleStatus } from "../domain/enums";
import { PricingSchedule } from "../domain/pricing-schedule.aggregate";

type PricingScheduleRow = {
  id: string;
  organizationId: string;
  tenderId: string;
  lotId: string | null;
  clientAccountId: string;
  financialDocumentType: string;
  sourceDocumentId: string;
  sourceDocumentVersionId: string;
  status: string;
  currentVersionId: string | null;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainPricingSchedule(record: PricingScheduleRow): PricingSchedule {
  return PricingSchedule.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    tenderId: record.tenderId,
    lotId: record.lotId ?? undefined,
    clientAccountId: record.clientAccountId,
    financialDocumentType: record.financialDocumentType as FinancialDocumentType,
    sourceDocumentId: record.sourceDocumentId,
    sourceDocumentVersionId: record.sourceDocumentVersionId,
    status: record.status as PricingScheduleStatus,
    currentVersionId: record.currentVersionId ?? undefined,
    currentVersionNumber: record.currentVersionNumber,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPricingScheduleRow(schedule: PricingSchedule) {
  return {
    id: schedule.id,
    organizationId: schedule.organizationId,
    tenderId: schedule.tenderId,
    lotId: schedule.lotId ?? null,
    clientAccountId: schedule.clientAccountId,
    financialDocumentType: schedule.financialDocumentType,
    sourceDocumentId: schedule.sourceDocumentId,
    sourceDocumentVersionId: schedule.sourceDocumentVersionId,
    status: schedule.status,
    currentVersionId: schedule.currentVersionId ?? null,
    currentVersionNumber: schedule.currentVersionNumber,
    createdBy: schedule.createdBy,
    createdAt: schedule.createdAt,
    updatedAt: schedule.updatedAt,
  };
}
