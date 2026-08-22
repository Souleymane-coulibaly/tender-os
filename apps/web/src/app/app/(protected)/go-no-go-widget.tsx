import { BarDistribution, type BarDistributionItem } from "../../../components/ui/charts/bar-distribution";
import { GO_NO_GO_LABELS, type DashboardGoNoGo } from "../../../lib/dashboard-types";

const DECISION_COLOR_CLASS: Record<string, string> = {
  GO: "bg-green-500",
  GO_CONDITIONAL: "bg-amber-500",
  NO_GO: "bg-red-400",
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §7) — projection pure
 * de `goNoGo.countByDecision` (module Opportunity, `GetGoNoGoSummaryForDashboardUseCase`) et de
 * `analytics.goRate` (déjà calculé côté backend : (GO + GO_CONDITIONAL) / décisions de la période,
 * JAMAIS / tous les Tenders — voir ANALYTICS_SOT_MATRIX). Aucun lien de filtre sur les segments :
 * aucune vue Tenders filtrable par décision GO/NO-GO n'existe aujourd'hui (mission "jamais un lien
 * non fonctionnel") — réutilise `BarDistribution` telle quelle, jamais une seconde implémentation
 * de barres dupliquée.
 */
export function GoNoGoWidget({ goNoGo, goRate }: { goNoGo: DashboardGoNoGo; goRate: number | null }) {
  const items: BarDistributionItem[] = (["GO", "GO_CONDITIONAL", "NO_GO"] as const).map((decision) => ({
    key: decision,
    label: GO_NO_GO_LABELS[decision],
    count: goNoGo.countByDecision[decision] ?? 0,
    colorClass: DECISION_COLOR_CLASS[decision] ?? "bg-tenderos-slate/40",
  }));

  return (
    <BarDistribution
      title="GO / NO-GO"
      subtitle={`Décisions des ${goNoGo.periodDays} derniers jours`}
      items={items}
      total={goNoGo.total}
      emptyLabel="Aucune décision GO/NO-GO enregistrée sur la période."
      headerExtra={
        goRate !== null ? (
          <div className="text-right">
            <span className="block text-2xl font-extrabold tabular-nums text-tenderos-navy">{goRate}%</span>
            <span className="block text-xs text-tenderos-slate">Taux de GO</span>
          </div>
        ) : undefined
      }
    />
  );
}
