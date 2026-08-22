import { BarDistribution, type BarDistributionItem } from "../../../components/ui/charts/bar-distribution";
import { BOARD_STATUSES, TENDER_STATUS_LABELS } from "../../../lib/tenders-types";
import type { DashboardPipelineStage } from "../../../lib/dashboard-types";

const STATUS_COLOR_CLASS: Record<string, string> = {
  DRAFT: "bg-tenderos-slate/40",
  IN_ANALYSIS: "bg-tenderos-blue/60",
  READY: "bg-tenderos-blue",
  IN_PREPARATION: "bg-purple-400",
  READY_TO_SUBMIT: "bg-tenderos-gold",
  SUBMITTED: "bg-amber-500",
  WON: "bg-green-500",
  LOST: "bg-red-400",
};

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2, Premium Analytics addendum §6) — projection pure
 * de `pipeline` (déjà `tenderStats.byStatus`, une agrégation SQL `groupBy` exacte côté backend),
 * jamais un second calcul de statut. Ordre = ordre réel du funnel (`BOARD_STATUSES`, même
 * exclusion d'ARCHIVED que le Kanban — un dossier archivé n'est plus "en pipeline actif").
 */
export function PipelineDistributionWidget({ pipeline }: { pipeline: DashboardPipelineStage[] }) {
  const countByStatus = new Map(pipeline.map((stage) => [stage.status, stage.count]));
  const items: BarDistributionItem[] = BOARD_STATUSES.map((status) => ({
    key: status,
    label: TENDER_STATUS_LABELS[status],
    count: countByStatus.get(status) ?? 0,
    colorClass: STATUS_COLOR_CLASS[status] ?? "bg-tenderos-slate/40",
    href: `/app/tenders?status=${status}`,
  }));
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return <BarDistribution title="Pipeline" subtitle="Répartition des dossiers actifs par statut" items={items} total={total} emptyLabel="Aucun dossier actif pour le moment." />;
}
