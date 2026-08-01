import { InvalidPricingScopeError } from "./errors";

/**
 * Catalogue fermé (mission Sprint 7 §"Types de pricing" — "ne crée pas des dizaines d'enums
 * inutiles... suffisamment simple pour la V1, mais extensible pour le Sprint 18"). Détermine le
 * PÉRIMÈTRE d'une estimation, jamais sa nature réelle/estimée (voir `PricingSourceKind`) : une
 * `PricingEstimate` de type `TENDER_ESTIMATE` porte toujours des lignes marquées ESTIMATED, jamais
 * de coût réel — le coût réel est lu séparément via `GenerationCostReader`, jamais mélangé dans une
 * même ligne de breakdown.
 */
export const PricingType = {
  AiTechnicalCost: "AI_TECHNICAL_COST",
  GenerationEstimate: "GENERATION_ESTIMATE",
  TenderEstimate: "TENDER_ESTIMATE",
  ClientCostSummary: "CLIENT_COST_SUMMARY",
  OrganizationCostSummary: "ORGANIZATION_COST_SUMMARY",
  ProductionEstimate: "PRODUCTION_ESTIMATE",
  CommercialPreview: "COMMERCIAL_PREVIEW",
} as const;

export type PricingType = (typeof PricingType)[keyof typeof PricingType];

export function isPricingType(value: string): value is PricingType {
  return Object.values(PricingType).includes(value as PricingType);
}

export function parsePricingType(value: string): PricingType {
  if (!isPricingType(value)) {
    throw new InvalidPricingScopeError(`"${value}" is not a known pricing type`);
  }
  return value;
}
