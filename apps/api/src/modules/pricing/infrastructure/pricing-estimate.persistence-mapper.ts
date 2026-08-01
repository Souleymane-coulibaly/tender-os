import { randomUUID } from "node:crypto";
import { Prisma, type PricingEstimate as PricingEstimateRecord, type PricingEstimateVersion as PricingEstimateVersionRecord, type PricingBreakdownLine as PricingBreakdownLineRecord } from "@prisma/client";
import { CostBreakdownLine } from "../domain/cost-breakdown-line";
import { Money } from "../domain/money.value-object";
import { PricingAssumptions, type PricingAssumptionsProps } from "../domain/pricing-assumptions";
import { PricingEstimate } from "../domain/pricing-estimate.aggregate";
import { PricingEstimateVersion } from "../domain/pricing-estimate-version.entity";
import { PricingSource } from "../domain/pricing-source";
import type { PricingStatus } from "../domain/pricing-status";
import type { PricingType } from "../domain/pricing-type";

export function toDomainEstimate(record: PricingEstimateRecord): PricingEstimate {
  return PricingEstimate.rehydrate({
    id: record.id,
    organizationId: record.organizationId,
    clientAccountId: record.clientAccountId ?? undefined,
    tenderId: record.tenderId ?? undefined,
    type: record.type as PricingType,
    status: record.status as PricingStatus,
    currentVersionId: record.currentVersionId ?? undefined,
    currentVersionNumber: record.currentVersionNumber,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    archivedAt: record.archivedAt ?? undefined,
  });
}

export function toEstimatePersistence(estimate: PricingEstimate) {
  return {
    id: estimate.id,
    organizationId: estimate.organizationId,
    clientAccountId: estimate.clientAccountId ?? null,
    tenderId: estimate.tenderId ?? null,
    type: estimate.type,
    status: estimate.status,
    currentVersionId: estimate.currentVersionId ?? null,
    currentVersionNumber: estimate.currentVersionNumber,
    createdBy: estimate.createdBy,
    createdAt: estimate.createdAt,
    archivedAt: estimate.archivedAt ?? null,
  };
}

export function toDomainVersion(
  record: PricingEstimateVersionRecord & { breakdownLines: readonly PricingBreakdownLineRecord[] },
): PricingEstimateVersion {
  const breakdown = record.breakdownLines
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((line) =>
      CostBreakdownLine.create({
        type: line.type,
        label: line.label,
        quantity: line.quantity?.toString(),
        unit: line.unit ?? undefined,
        unitPrice:
          line.unitPriceValue && line.unitPriceCurrency
            ? Money.create({ amount: line.unitPriceValue.toString(), currency: line.unitPriceCurrency })
            : undefined,
        amount: Money.create({ amount: line.amountValue.toString(), currency: line.amountCurrency }),
        source: line.source as PricingSource,
        displayOrder: line.displayOrder,
      }),
    );

  return PricingEstimateVersion.rehydrate({
    id: record.id,
    estimateId: record.estimateId,
    organizationId: record.organizationId,
    version: record.version,
    amount: Money.create({ amount: record.amountValue.toString(), currency: record.amountCurrency }),
    breakdown,
    assumptions: PricingAssumptions.create(record.assumptions as PricingAssumptionsProps),
    status: record.status as PricingStatus,
    disclaimerVersion: record.disclaimerVersion,
    source: record.source,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    supersededAt: record.supersededAt ?? undefined,
    recalculationReason: record.recalculationReason ?? undefined,
  });
}

export function toVersionPersistence(version: PricingEstimateVersion) {
  return {
    id: version.id,
    estimateId: version.estimateId,
    organizationId: version.organizationId,
    version: version.version,
    status: version.status,
    amountValue: version.amount.toFixed(),
    amountCurrency: version.amount.currency,
    assumptions: version.assumptions.toJSON() as Prisma.InputJsonValue,
    disclaimerVersion: version.disclaimerVersion,
    source: version.source,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    supersededAt: version.supersededAt ?? null,
    recalculationReason: version.recalculationReason ?? null,
  };
}

export function toBreakdownLinesPersistence(version: PricingEstimateVersion) {
  return version.breakdown.map((line) => ({
    id: randomUUID(),
    estimateVersionId: version.id,
    type: line.type,
    label: line.label,
    quantity: line.quantity ?? null,
    unit: line.unit ?? null,
    unitPriceValue: line.unitPrice?.toFixed() ?? null,
    unitPriceCurrency: line.unitPrice?.currency ?? null,
    amountValue: line.amount.toFixed(),
    amountCurrency: line.amount.currency,
    source: line.source,
    displayOrder: line.displayOrder,
  }));
}
