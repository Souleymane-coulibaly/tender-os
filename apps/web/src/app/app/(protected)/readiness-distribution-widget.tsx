import { BarDistribution, type BarDistributionItem } from "../../../components/ui/charts/bar-distribution";
import { READINESS_STATUS_LABELS, type DashboardReadinessDistribution, type ReadinessStatus } from "../../../lib/dashboard-types";

const STATUS_COLOR_CLASS: Record<ReadinessStatus, string> = {
  NOT_READY: "bg-red-400",
  IN_PROGRESS: "bg-amber-500",
  READY_WITH_WARNINGS: "bg-tenderos-gold",
  READY: "bg-green-500",
};

const STATUS_ORDER: ReadinessStatus[] = ["NOT_READY", "IN_PROGRESS", "READY_WITH_WARNINGS", "READY"];

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §8) — projection pure
 * de `analytics.readinessDistribution` (tally de `readinessStatus`, déjà calculé par le moteur de
 * préparation Tenders — mission "AUCUN DashboardReadinessCalculator"). Aucun lien de filtre : la
 * vue Tenders ne propose aujourd'hui aucun filtre par statut de préparation (gap documenté).
 */
export function ReadinessDistributionWidget({ readiness }: { readiness: DashboardReadinessDistribution }) {
  const items: BarDistributionItem[] = STATUS_ORDER.map((status) => ({
    key: status,
    label: READINESS_STATUS_LABELS[status],
    count: readiness.countByStatus[status] ?? 0,
    colorClass: STATUS_COLOR_CLASS[status],
  }));

  return (
    <BarDistribution title="Préparation des dossiers" subtitle="Statut de readiness des dossiers actifs" items={items} total={readiness.total} emptyLabel="Aucun dossier actif pour le moment." />
  );
}
