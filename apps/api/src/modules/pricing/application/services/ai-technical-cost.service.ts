import { type AiTechnicalCost, unknownAiTechnicalCost } from "../../domain/ai-technical-cost";
import { CostDataStatus } from "../../domain/cost-data-status";
import { Money } from "../../domain/money.value-object";
import type { GenerationCostRow } from "../ports/generation-cost-reader";

/**
 * Traduit une ligne `GenerationCostRow` (lecture brute Sprint 6) en `AiTechnicalCost` du domaine
 * Pricing (mission Sprint 7 §"Calcul du coût technique IA") — une pure fonction de LECTURE, jamais
 * un recalcul : le montant vient tel quel de `Generation.estimatedCostAmount` (déjà figé au tarif
 * en vigueur au moment de la génération, correctif Sprint 6 P2-3). Ne renvoie JAMAIS `0` pour un
 * coût inconnu (mission §"Gestion d'un coût inconnu").
 */
export function toAiTechnicalCost(row: GenerationCostRow): AiTechnicalCost {
  if (row.status === "FAILED" || row.status === "CANCELLED") {
    return unknownAiTechnicalCost(`Generation ${row.status.toLowerCase()}; no technical cost was ever produced.`);
  }
  if (row.status === "PENDING" || row.status === "GENERATING") {
    return unknownAiTechnicalCost("Generation is still in progress; no technical cost is available yet.");
  }

  const hasAmount = row.costAmount !== undefined && row.currency !== undefined;
  const hasTokens = row.totalTokenCount !== undefined;

  if (hasAmount && hasTokens) {
    return {
      status: CostDataStatus.Calculated,
      amount: Money.create({ amount: row.costAmount!, currency: row.currency! }),
      inputTokenCount: row.inputTokenCount,
      outputTokenCount: row.outputTokenCount,
      totalTokenCount: row.totalTokenCount,
      fallbackLevel: row.fallbackLevel,
    };
  }

  if (hasAmount || hasTokens) {
    return {
      status: CostDataStatus.Partial,
      amount: hasAmount ? Money.create({ amount: row.costAmount!, currency: row.currency! }) : undefined,
      inputTokenCount: row.inputTokenCount,
      outputTokenCount: row.outputTokenCount,
      totalTokenCount: row.totalTokenCount,
      fallbackLevel: row.fallbackLevel,
      reason: hasAmount
        ? "Token counts are missing for this generation."
        : "No pricing snapshot could be resolved for the model used; the amount is unavailable.",
    };
  }

  return unknownAiTechnicalCost("Neither a cost amount nor token counts are available for this generation.");
}

export type AiTechnicalCostAggregate = Readonly<{
  generationCount: number;
  calculatedCount: number;
  partialCount: number;
  unknownCount: number;
  /** Une entrée par devise rencontrée parmi les coûts CALCULATED — mission §"aucune agrégation
   *  directe entre devises différentes" : jamais sommées ensemble, jamais converties. Un consommateur
   *  affichant ce total doit signaler explicitement s'il y a plus d'une devise. */
  totalsByCurrency: Readonly<Record<string, Money>>;
}>;

export function aggregateAiTechnicalCosts(rows: readonly GenerationCostRow[]): AiTechnicalCostAggregate {
  let calculatedCount = 0;
  let partialCount = 0;
  let unknownCount = 0;
  const totals = new Map<string, Money>();

  for (const row of rows) {
    const cost = toAiTechnicalCost(row);
    if (cost.status === CostDataStatus.Calculated) {
      calculatedCount += 1;
      const current = totals.get(cost.amount!.currency) ?? Money.zero(cost.amount!.currency);
      totals.set(cost.amount!.currency, current.add(cost.amount!));
    } else if (cost.status === CostDataStatus.Partial) {
      partialCount += 1;
    } else {
      unknownCount += 1;
    }
  }

  return {
    generationCount: rows.length,
    calculatedCount,
    partialCount,
    unknownCount,
    totalsByCurrency: Object.fromEntries(totals),
  };
}
