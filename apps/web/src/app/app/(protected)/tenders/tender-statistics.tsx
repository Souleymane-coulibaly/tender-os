import { Card } from "../../../../components/ui";
import type { TenderStatistics as TenderStatisticsData } from "../../../../lib/tenders-types";

type StatTileTone = "warning" | "critical";

/** Couleur du chiffre selon le niveau d'alerte — `StatCard` (components/ui) ne porte pas de ton
 *  d'alerte, d'ou cette tuile locale en `Card` compacte. */
const VALUE_TONE_CLASSES: Record<StatTileTone | "default", string> = {
  default: "text-tenderos-navy",
  warning: "text-warning-fg",
  critical: "text-danger-fg",
};

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: StatTileTone | undefined;
}) {
  return (
    <Card padding="tight">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-tenderos-slate">{label}</span>
        <span className={`text-2xl font-extrabold tabular-nums ${VALUE_TONE_CLASSES[tone ?? "default"]}`}>{value}</span>
      </div>
    </Card>
  );
}

export function TenderStatistics({ stats }: { stats: TenderStatisticsData }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Actifs" value={stats.totalActive} />
        <StatTile label="Échéances ≤ 7 jours" value={stats.deadlinesNext7Days} tone="warning" />
        <StatTile label="En retard" value={stats.overdueCount} tone={stats.overdueCount > 0 ? "critical" : undefined} />
        <StatTile label="Prêts à déposer" value={stats.readyToSubmitCount} />
        <StatTile label="À risque" value={stats.atRiskCount} tone={stats.atRiskCount > 0 ? "critical" : undefined} />
        <StatTile label="Préparation moyenne" value={`${stats.averageReadinessScore}/100`} />
      </div>
      <p className="text-xs italic text-tenderos-slate">{stats.disclaimer}</p>
    </section>
  );
}
