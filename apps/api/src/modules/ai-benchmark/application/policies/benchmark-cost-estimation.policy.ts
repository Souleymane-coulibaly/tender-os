import type { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import { BenchmarkCostCeilingExceededError, InvalidBenchmarkRunParametersError } from "../../domain/errors";

export type BenchmarkCostEstimate = Readonly<{ amount: string; currency: string }>;

/** Estimation PRÉVISIONNELLE (Sprint 5.2 §"Estimation du coût") — jamais présentée comme exacte,
 *  jamais recalculée rétroactivement si le tarif change ensuite (chaque snapshot est figé). Exige
 *  que tous les modèles sélectionnés partagent la même devise : une comparaison inter-devises
 *  nécessiterait un taux de change hors périmètre de ce sprint. */
export function estimateBenchmarkRunCost(input: {
  pricingSnapshots: readonly AiModelPricingSnapshot[];
  caseCount: number;
  repetitions: number;
  estimatedInputTokensPerCase: number;
  estimatedOutputTokensPerCase: number;
}): BenchmarkCostEstimate {
  if (input.pricingSnapshots.length === 0) {
    throw new InvalidBenchmarkRunParametersError("At least one selected model must have an active pricing snapshot.");
  }

  const currency = input.pricingSnapshots[0]!.currency;
  if (input.pricingSnapshots.some((snapshot) => snapshot.currency !== currency)) {
    throw new InvalidBenchmarkRunParametersError("All selected models must share the same pricing currency for a cost estimate.");
  }

  const totalInputTokens = input.caseCount * input.repetitions * input.estimatedInputTokensPerCase;
  const totalOutputTokens = input.caseCount * input.repetitions * input.estimatedOutputTokensPerCase;

  const totalAmount = input.pricingSnapshots.reduce(
    (sum, snapshot) => sum + Number(snapshot.estimateCost({ inputTokens: totalInputTokens, outputTokens: totalOutputTokens })),
    0,
  );

  return { amount: totalAmount.toFixed(6), currency };
}

export function assertWithinCostCeiling(estimate: BenchmarkCostEstimate, ceilingAmount: string): void {
  if (Number(estimate.amount) > Number(ceilingAmount)) {
    throw new BenchmarkCostCeilingExceededError({ estimated: estimate.amount, ceiling: ceilingAmount, currency: estimate.currency });
  }
}
