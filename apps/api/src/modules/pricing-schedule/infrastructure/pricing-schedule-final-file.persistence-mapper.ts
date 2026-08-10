import { PricingScheduleFinalFile } from "../domain/pricing-schedule-final-file.value-object";

type PricingScheduleFinalFileRow = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  documentId: string;
  documentVersionId: string;
  injectedCellCount: number;
  generatedBy: string;
  generatedAt: Date;
};

export function toDomainPricingScheduleFinalFile(record: PricingScheduleFinalFileRow): PricingScheduleFinalFile {
  return PricingScheduleFinalFile.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    pricingScheduleVersionId: record.pricingScheduleVersionId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    injectedCellCount: record.injectedCellCount,
    generatedBy: record.generatedBy,
    generatedAt: record.generatedAt,
  });
}

export function toPricingScheduleFinalFileRow(finalFile: PricingScheduleFinalFile) {
  return {
    id: finalFile.id,
    organizationId: finalFile.organizationId,
    pricingScheduleVersionId: finalFile.pricingScheduleVersionId,
    documentId: finalFile.documentId,
    documentVersionId: finalFile.documentVersionId,
    injectedCellCount: finalFile.injectedCellCount,
    generatedBy: finalFile.generatedBy,
    generatedAt: finalFile.generatedAt,
  };
}
