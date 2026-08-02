export { PricingModule } from "./pricing.module";

// Réexportés pour permettre au module Export (Sprint 8A) d'inclure un rapport de coûts figé sur
// une version précise d'une estimation — jamais un recalcul à l'export (mission Sprint 8A §17
// "ne pas recalculer les montants à l'export... conserver la devise, le statut réel/estimé/
// partiel/inconnu, les hypothèses, la date"). Reste RBAC-gated en interne (ReadPricing).
export { GetPricingEstimateUseCase } from "./application/use-cases/get-pricing-estimate.use-case";
export type { GetPricingEstimateQuery } from "./application/use-cases/get-pricing-estimate.use-case";
export type { PricingEstimateSummary, PricingEstimateVersionSummary, BreakdownLineSummary } from "./application/dtos";
export { ESTIMATE_DISCLAIMER_TEXT } from "./domain/disclaimer";
