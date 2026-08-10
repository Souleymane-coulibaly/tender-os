import { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import type { PricingScheduleLineKind, PricingScheduleLineStatus } from "../domain/enums";
import { PricingScheduleLine, type PricingScheduleLineCostBreakdown } from "../domain/pricing-schedule-line.entity";

type PricingScheduleLineRow = {
  id: string;
  organizationId: string;
  pricingScheduleVersionId: string;
  sheetName: string;
  rowNumber: number;
  kind: string;
  hierarchyLevel: number;
  parentLineId: string | null;
  designation: string;
  unit: string | null;
  quantity: Decimal | null;
  designationCellRef: string | null;
  quantityCellRef: string | null;
  buyerUnitPriceCellRef: string | null;
  buyerTotalCellRef: string | null;
  proposedUnitPrice: Decimal | null;
  proposedTotal: Decimal | null;
  currencyCode: string;
  costBreakdown: Prisma.JsonValue | null;
  candidateComment: string | null;
  status: string;
  matchingKey: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

export function toDomainPricingScheduleLine(record: PricingScheduleLineRow): PricingScheduleLine {
  return PricingScheduleLine.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    pricingScheduleVersionId: record.pricingScheduleVersionId,
    sheetName: record.sheetName,
    rowNumber: record.rowNumber,
    kind: record.kind as PricingScheduleLineKind,
    hierarchyLevel: record.hierarchyLevel,
    parentLineId: record.parentLineId ?? undefined,
    designation: record.designation,
    unit: record.unit ?? undefined,
    quantity: record.quantity?.toString(),
    designationCellRef: record.designationCellRef ?? undefined,
    quantityCellRef: record.quantityCellRef ?? undefined,
    buyerUnitPriceCellRef: record.buyerUnitPriceCellRef ?? undefined,
    buyerTotalCellRef: record.buyerTotalCellRef ?? undefined,
    proposedUnitPrice: record.proposedUnitPrice?.toString(),
    proposedTotal: record.proposedTotal?.toString(),
    currencyCode: record.currencyCode,
    costBreakdown: (record.costBreakdown as PricingScheduleLineCostBreakdown | null) ?? undefined,
    candidateComment: record.candidateComment ?? undefined,
    status: record.status as PricingScheduleLineStatus,
    matchingKey: record.matchingKey ?? undefined,
    metadata: (record.metadata as Record<string, unknown>) ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function toPricingScheduleLineRow(line: PricingScheduleLine) {
  return {
    id: line.id,
    organizationId: line.organizationId,
    pricingScheduleVersionId: line.pricingScheduleVersionId,
    sheetName: line.sheetName,
    rowNumber: line.rowNumber,
    kind: line.kind,
    hierarchyLevel: line.hierarchyLevel,
    parentLineId: line.parentLineId ?? null,
    designation: line.designation,
    unit: line.unit ?? null,
    quantity: line.quantity ?? null,
    designationCellRef: line.designationCellRef ?? null,
    quantityCellRef: line.quantityCellRef ?? null,
    buyerUnitPriceCellRef: line.buyerUnitPriceCellRef ?? null,
    buyerTotalCellRef: line.buyerTotalCellRef ?? null,
    proposedUnitPrice: line.proposedUnitPrice ?? null,
    proposedTotal: line.proposedTotal ?? null,
    currencyCode: line.currencyCode,
    costBreakdown: line.costBreakdown === undefined ? Prisma.JsonNull : (line.costBreakdown as Prisma.InputJsonValue),
    candidateComment: line.candidateComment ?? null,
    status: line.status,
    matchingKey: line.matchingKey ?? null,
    metadata: line.metadata as Prisma.InputJsonValue,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}
