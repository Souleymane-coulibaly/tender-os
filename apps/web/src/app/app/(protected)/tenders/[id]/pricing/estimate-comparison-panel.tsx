"use client";

import { useState } from "react";
import { getPricingEstimateComparisonAction } from "../../../../pricing-actions";
import type { CostComparison } from "../../../../../../lib/pricing-types";
import { Button } from "../../../../../../components/ui/button";

/**
 * Mission Sprint 7 §"Comparaison estimé/réel" — consultation à la demande (jamais un recalcul de
 * l'estimation), réutilise `GET /pricing/estimates/:id/comparison`. Jamais un montant fusionné :
 * estimé et réel restent deux valeurs distinctes, l'écart est affiché séparément, jamais un 0 €
 * quand le réel est inconnu.
 */
export function EstimateComparisonPanel({ estimateId }: { estimateId: string }) {
  const [comparison, setComparison] = useState<CostComparison | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  async function handleCompare() {
    setIsLoading(true);
    setError(undefined);
    const result = await getPricingEstimateComparisonAction(estimateId);
    setIsLoading(false);
    if (result.error) setError(result.error);
    else setComparison(result.comparison);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={isLoading}
        onClick={handleCompare}
        className="self-start"
        variant="secondary"
        size="sm"
      >
        {isLoading ? "Comparaison..." : "Comparer estimé/réel"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
      {comparison ? (
        <div className="flex flex-col gap-1 rounded border border-tenderos-navy/10 bg-tenderos-light p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-tenderos-slate">Coût IA estimé</span>
            <span className="font-medium text-tenderos-navy">
              {comparison.estimatedAiCostAmount
                ? `${comparison.estimatedAiCostAmount} ${comparison.currency ?? ""}`
                : "Coût non disponible"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-tenderos-slate">Coût IA réel</span>
            <span className="font-medium text-tenderos-navy">
              {comparison.actualStatus === "AVAILABLE" && comparison.actualAiCostAmount
                ? `${comparison.actualAiCostAmount} ${comparison.currency ?? ""}`
                : comparison.actualStatus === "CURRENCY_MISMATCH"
                  ? "Devises différentes — non comparable"
                  : "Coût non disponible"}
            </span>
          </div>
          {comparison.actualStatus === "AVAILABLE" ? (
            <div className="flex justify-between">
              <span className="text-tenderos-slate">Écart</span>
              <span className="font-medium text-tenderos-navy">
                {comparison.absoluteDifference} {comparison.currency}
                {comparison.percentageDifference !== undefined
                  ? ` (${comparison.percentageDifference} %)`
                  : ""}
              </span>
            </div>
          ) : null}
          <p className="mt-1 text-xs text-tenderos-slate">{comparison.disclaimerText}</p>
        </div>
      ) : null}
    </div>
  );
}
