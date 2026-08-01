import type { AiTechnicalCost } from "../domain/ai-technical-cost";
import type { AiTechnicalCostAggregate } from "./services/ai-technical-cost.service";
import { ESTIMATE_DISCLAIMER_TEXT } from "../domain/disclaimer";
import type { CostBreakdownLine } from "../domain/cost-breakdown-line";
import type { PricingEstimate } from "../domain/pricing-estimate.aggregate";
import type { PricingEstimateVersion } from "../domain/pricing-estimate-version.entity";

export type BreakdownLineSummary = {
  type: string;
  label: string;
  quantity?: string | undefined;
  unit?: string | undefined;
  unitPriceAmount?: string | undefined;
  unitPriceCurrency?: string | undefined;
  amount: string;
  currency: string;
  source: string;
  displayOrder: number;
};

export function toBreakdownLineSummary(line: CostBreakdownLine): BreakdownLineSummary {
  return {
    type: line.type,
    label: line.label,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceAmount: line.unitPrice?.toFixed(),
    unitPriceCurrency: line.unitPrice?.currency,
    amount: line.amount.toFixed(),
    currency: line.amount.currency,
    source: line.source,
    displayOrder: line.displayOrder,
  };
}

export type PricingEstimateVersionSummary = {
  id: string;
  estimateId: string;
  version: number;
  amount: string;
  currency: string;
  breakdown: BreakdownLineSummary[];
  assumptions: Record<string, unknown>;
  status: string;
  disclaimerVersion: number;
  disclaimerText: string;
  source: string;
  createdBy: string;
  createdAt: string;
  supersededAt?: string | undefined;
  recalculationReason?: string | undefined;
};

export function toPricingEstimateVersionSummary(version: PricingEstimateVersion): PricingEstimateVersionSummary {
  return {
    id: version.id,
    estimateId: version.estimateId,
    version: version.version,
    amount: version.amount.toFixed(),
    currency: version.amount.currency,
    breakdown: version.breakdown.map(toBreakdownLineSummary),
    assumptions: version.assumptions.toJSON(),
    status: version.status,
    disclaimerVersion: version.disclaimerVersion,
    disclaimerText: ESTIMATE_DISCLAIMER_TEXT,
    source: version.source,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    supersededAt: version.supersededAt?.toISOString(),
    recalculationReason: version.recalculationReason,
  };
}

export type PricingEstimateSummary = {
  id: string;
  organizationId: string;
  clientAccountId?: string | undefined;
  tenderId?: string | undefined;
  type: string;
  status: string;
  currentVersionNumber: number;
  createdBy: string;
  createdAt: string;
  archivedAt?: string | undefined;
  currentVersion: PricingEstimateVersionSummary;
};

export function toPricingEstimateSummary(estimate: PricingEstimate, currentVersion: PricingEstimateVersion): PricingEstimateSummary {
  return {
    id: estimate.id,
    organizationId: estimate.organizationId,
    clientAccountId: estimate.clientAccountId,
    tenderId: estimate.tenderId,
    type: estimate.type,
    status: estimate.status,
    currentVersionNumber: estimate.currentVersionNumber,
    createdBy: estimate.createdBy,
    createdAt: estimate.createdAt.toISOString(),
    archivedAt: estimate.archivedAt?.toISOString(),
    currentVersion: toPricingEstimateVersionSummary(currentVersion),
  };
}

export type AiTechnicalCostSummary = {
  status: string;
  amount?: string | undefined;
  currency?: string | undefined;
  inputTokenCount?: number | undefined;
  outputTokenCount?: number | undefined;
  totalTokenCount?: number | undefined;
  fallbackLevel?: number | undefined;
  reason?: string | undefined;
};

export function toAiTechnicalCostSummary(cost: AiTechnicalCost): AiTechnicalCostSummary {
  return {
    status: cost.status,
    amount: cost.amount?.toFixed(),
    currency: cost.amount?.currency,
    inputTokenCount: cost.inputTokenCount,
    outputTokenCount: cost.outputTokenCount,
    totalTokenCount: cost.totalTokenCount,
    fallbackLevel: cost.fallbackLevel,
    reason: cost.reason,
  };
}

export type CostAggregateSummary = {
  generationCount: number;
  calculatedCount: number;
  partialCount: number;
  unknownCount: number;
  totalsByCurrency: Record<string, string>;
  /** `true` si plus d'une devise a été rencontrée — le frontend DOIT alors présenter les totaux
   *  séparément, jamais un total unique fusionné (mission §"aucune agrégation directe entre devises
   *  différentes"). */
  mixedCurrencies: boolean;
};

export function toCostAggregateSummary(aggregate: AiTechnicalCostAggregate): CostAggregateSummary {
  const currencies = Object.keys(aggregate.totalsByCurrency);
  return {
    generationCount: aggregate.generationCount,
    calculatedCount: aggregate.calculatedCount,
    partialCount: aggregate.partialCount,
    unknownCount: aggregate.unknownCount,
    totalsByCurrency: Object.fromEntries(currencies.map((currency) => [currency, aggregate.totalsByCurrency[currency]!.toFixed()])),
    mixedCurrencies: currencies.length > 1,
  };
}
