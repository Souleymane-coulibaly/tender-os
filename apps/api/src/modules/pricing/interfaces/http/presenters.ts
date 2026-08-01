import type { PricingEstimateSummary } from "../../application/dtos";

export function presentPricingEstimate(estimate: PricingEstimateSummary): PricingEstimateSummary {
  return { ...estimate };
}
