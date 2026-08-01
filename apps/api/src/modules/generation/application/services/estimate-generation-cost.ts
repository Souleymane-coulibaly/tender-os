import type { GenerationModelRate } from "../../infrastructure/generation-config";

export type EstimatedGenerationCost = Readonly<{ amount: string; currency: string }>;

/**
 * Estimation informative — JAMAIS une source de facturation (mission hors périmètre §"pricing
 * commercial du Sprint 7"). Pure, déterministe : aucun tarif connu pour ce modèle => `undefined`,
 * jamais un coût inventé.
 */
export function estimateGenerationCost(input: {
  provider: string;
  modelKey: string;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  modelRates: Readonly<Record<string, GenerationModelRate>>;
}): EstimatedGenerationCost | undefined {
  const rate = input.modelRates[`${input.provider}:${input.modelKey}`];
  if (!rate) return undefined;

  const inputCost = ((input.inputTokens ?? 0) / 1_000_000) * rate.inputPricePerMillionTokens;
  const outputCost = ((input.outputTokens ?? 0) / 1_000_000) * rate.outputPricePerMillionTokens;
  const total = inputCost + outputCost;

  return { amount: total.toFixed(6), currency: rate.currency };
}
