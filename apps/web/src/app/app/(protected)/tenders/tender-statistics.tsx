import type { TenderStatistics as TenderStatisticsData } from "../../../../lib/tenders-types";

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "warning" | "critical" | undefined;
}) {
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-tenderos-navy/10 bg-white text-tenderos-navy";

  return (
    <div className={`flex flex-col gap-1 rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-xl font-extrabold tabular-nums">{value}</span>
    </div>
  );
}

export function TenderStatistics({ stats }: { stats: TenderStatisticsData }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Actifs" value={stats.totalActive} />
        <StatCard label="Échéances ≤ 7 jours" value={stats.deadlinesNext7Days} tone="warning" />
        <StatCard label="En retard" value={stats.overdueCount} tone={stats.overdueCount > 0 ? "critical" : undefined} />
        <StatCard label="Prêts à déposer" value={stats.readyToSubmitCount} />
        <StatCard label="À risque" value={stats.atRiskCount} tone={stats.atRiskCount > 0 ? "critical" : undefined} />
        <StatCard label="Préparation moyenne" value={`${stats.averageReadinessScore}/100`} />
      </div>
      <p className="text-xs italic text-tenderos-slate">{stats.disclaimer}</p>
    </section>
  );
}
