import { Card } from "../../../components/ui";
import { TrendAreaChart } from "../../../components/ui/charts/trend-area-chart";
import type { DashboardActivityTrendPoint } from "../../../lib/dashboard-types";
import { PeriodSelector } from "./period-selector";

const PERIOD_LABELS: Record<number, string> = { 7: "7 derniers jours", 30: "30 derniers jours", 90: "90 derniers jours" };

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §4) — graphique
 * principal du cockpit : tendance de création d'appels d'offres. Données réelles uniquement
 * (`analytics.activityTrend`, `GetTenderActivityTrendUseCase`) — jamais une série fabriquée.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — enveloppe `&lt;Card&gt;` (doublon exact du
 * balisage local précédent), `headerExtra`-style `actions` accueille le total + sélecteur.
 */
export function ActivityTrendWidget({ points, periodDays }: { points: DashboardActivityTrendPoint[]; periodDays: number }) {
  const total = points.reduce((sum, p) => sum + p.count, 0);

  return (
    <Card
      title="Activité des appels d'offres"
      description={PERIOD_LABELS[periodDays] ?? `${periodDays} derniers jours`}
      actions={
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="block text-2xl font-extrabold tabular-nums text-tenderos-navy">{total}</span>
            <span className="block text-xs text-tenderos-slate">AO créés</span>
          </div>
          <PeriodSelector current={periodDays} />
        </div>
      }
    >
      <TrendAreaChart points={points} seriesLabel="Appels d'offres créés" />
    </Card>
  );
}
