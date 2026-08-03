export { PricingModule } from "./pricing.module";

// Réexportés pour permettre au module Export (Sprint 8A) d'inclure un rapport de coûts figé sur
// une version précise d'une estimation — jamais un recalcul à l'export (mission Sprint 8A §17
// "ne pas recalculer les montants à l'export... conserver la devise, le statut réel/estimé/
// partiel/inconnu, les hypothèses, la date"). Reste RBAC-gated en interne (ReadPricing).
export { GetPricingEstimateUseCase } from "./application/use-cases/get-pricing-estimate.use-case";
export type { GetPricingEstimateQuery } from "./application/use-cases/get-pricing-estimate.use-case";
// Réexporté pour Sprint 8A.1 (Deliverables) — retrouver l'estimation la plus récente d'un Tender
// pour la vue LECTURE SEULE "Rapport financier" (mission §14), jamais un recalcul.
export { ListPricingEstimatesUseCase } from "./application/use-cases/list-pricing-estimates.use-case";
export type { ListPricingEstimatesQuery, ListPricingEstimatesResult } from "./application/use-cases/list-pricing-estimates.use-case";
export type { PricingEstimateSummary, PricingEstimateVersionSummary, BreakdownLineSummary } from "./application/dtos";
export { ESTIMATE_DISCLAIMER_TEXT } from "./domain/disclaimer";

// Réexporté en LECTURE SEULE pour Sprint 8A.2 (module `cockpit`) — synthèse de coût d'un Tender
// (a-t-elle une estimation active ?) pour la vue d'ensemble, jamais un recalcul.
export { GetTenderCostSummaryUseCase } from "./application/use-cases/get-tender-cost-summary.use-case";
export type { GetTenderCostSummaryQuery, TenderCostSummary } from "./application/use-cases/get-tender-cost-summary.use-case";
