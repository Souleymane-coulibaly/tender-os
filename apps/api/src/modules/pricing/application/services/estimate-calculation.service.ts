import { CostBreakdownLine } from "../../domain/cost-breakdown-line";
import { InvalidPricingAssumptionError } from "../../domain/errors";
import { Money } from "../../domain/money.value-object";
import type { PricingAssumptions } from "../../domain/pricing-assumptions";
import { PricingSource } from "../../domain/pricing-source";
import { PricingStatus } from "../../domain/pricing-status";
import type { CurrentModelPricing } from "../ports/pricing-snapshot-reader";

export type EstimateCalculationResult = Readonly<{
  amount: Money;
  breakdown: readonly CostBreakdownLine[];
  status: PricingStatus;
}>;

/**
 * Compose le breakdown d'une estimation à partir des hypothèses saisies (mission Sprint 7
 * §"Coût de production prévisionnel" + §"Coût estimé avant génération") — jamais un mélange avec un
 * coût réel (toutes les lignes produites ici sont `ESTIMATED`, jamais `ACTUAL`). Devise UNIQUE pour
 * toute l'estimation (mission §"aucune conversion automatique sans source de taux") : celle du
 * tarif IA résolu si un modèle est routé, sinon `EUR` par défaut (mission §"EUR par défaut si la
 * politique métier le décide").
 */
export function calculateEstimateBreakdown(input: {
  assumptions: PricingAssumptions;
  modelPricing?: CurrentModelPricing | undefined;
}): EstimateCalculationResult {
  const currency = input.modelPricing?.currency ?? "EUR";
  const lines: CostBreakdownLine[] = [];
  let order = 0;
  let hasUnknownComponent = false;

  const generationsCount = input.assumptions.estimatedGenerationsCount;
  const inputTokensPerGeneration = input.assumptions.estimatedInputTokensPerGeneration;
  const outputTokensPerGeneration = input.assumptions.estimatedOutputTokensPerGeneration;

  if (generationsCount !== undefined && (inputTokensPerGeneration !== undefined || outputTokensPerGeneration !== undefined)) {
    if (!input.modelPricing) {
      hasUnknownComponent = true;
    } else {
      const totalInputTokens = generationsCount * (inputTokensPerGeneration ?? 0);
      const totalOutputTokens = generationsCount * (outputTokensPerGeneration ?? 0);
      const inputCost = Money.create({ amount: input.modelPricing.inputPricePerMillionTokens, currency }).multiply(totalInputTokens / 1_000_000);
      const outputCost = Money.create({ amount: input.modelPricing.outputPricePerMillionTokens, currency }).multiply(
        totalOutputTokens / 1_000_000,
      );
      const aiCost = inputCost.add(outputCost);
      lines.push(
        CostBreakdownLine.create({
          type: "AI_COST",
          label: "Coût IA estimé",
          quantity: String(generationsCount),
          unit: "generations",
          amount: aiCost,
          source: PricingSource.Estimated,
          displayOrder: order++,
        }),
      );
    }
  }

  if (input.assumptions.workHours !== undefined && input.assumptions.hourlyRate !== undefined) {
    const headcount = input.assumptions.headcount ?? 1;
    const hourlyRate = Money.create({ amount: input.assumptions.hourlyRate, currency });
    const productionCost = hourlyRate.multiply(input.assumptions.workHours).multiply(headcount);
    lines.push(
      CostBreakdownLine.create({
        type: "PRODUCTION_TIME",
        label: "Temps de préparation",
        quantity: String(input.assumptions.workHours * headcount),
        unit: "heures",
        unitPrice: hourlyRate,
        amount: productionCost,
        source: PricingSource.Estimated,
        displayOrder: order++,
      }),
    );
  }

  if (input.assumptions.additionalFeesAmount !== undefined) {
    lines.push(
      CostBreakdownLine.create({
        type: "FEES",
        label: "Frais",
        amount: Money.create({ amount: input.assumptions.additionalFeesAmount, currency }),
        source: PricingSource.Estimated,
        displayOrder: order++,
      }),
    );
  }

  if (lines.length === 0 && !hasUnknownComponent) {
    throw new InvalidPricingAssumptionError("at least one assumption (AI usage, work time, or fees) is required to compute an estimate");
  }

  const total = lines.reduce((sum, line) => sum.add(line.amount), Money.zero(currency));

  return {
    amount: total,
    breakdown: lines,
    status: hasUnknownComponent ? PricingStatus.Partial : PricingStatus.Calculated,
  };
}
