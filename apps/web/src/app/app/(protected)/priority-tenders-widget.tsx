import Link from "next/link";
import { Card } from "../../../components/ui";
import { DEADLINE_BUCKET_LABELS, type DashboardAttentionItem, type DeadlineBucket } from "../../../lib/dashboard-types";
import { TenderStatusBadge } from "./tenders/tender-status-badge";

const DISPLAY_LIMIT = 5;

function daysRemainingLabel(submissionDeadline: string | undefined, bucket: DeadlineBucket | undefined): string {
  if (!submissionDeadline) return "—";
  if (bucket === "OVERDUE") return "En retard";
  const days = Math.ceil((new Date(submissionDeadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  return days <= 0 ? DEADLINE_BUCKET_LABELS[bucket ?? "TODAY"] : `J-${days}`;
}

function AssigneeStack({ assignees }: { assignees: DashboardAttentionItem["assignees"] }) {
  if (assignees.length === 0) return <span className="text-xs text-tenderos-slate">—</span>;
  const visible = assignees.slice(0, 3);
  const overflow = assignees.length - visible.length;
  return (
    <div className="flex items-center -space-x-2" title={assignees.map((a) => a.displayName).join(", ")}>
      {visible.map((assignee) => (
        <span
          key={assignee.userId}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-tenderos-navy text-[11px] font-semibold text-white"
          aria-hidden="true"
        >
          {assignee.displayName.charAt(0).toUpperCase()}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-tenderos-light text-[11px] font-semibold text-tenderos-navy">+{overflow}</span>
      ) : null}
    </div>
  );
}

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.59 "Mes dossiers prioritaires" : remplace
 * `AttentionWidget` (dashboard-widgets.tsx, retiré de cette page) pour la vue d'ensemble, même
 * source de données (`attentionItems`, déjà triée par urgence côté backend — mission §25.60 "KPI et
 * listes doivent utiliser les mêmes règles de filtrage"), jamais un second calcul de priorité.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — enveloppe `&lt;Card&gt;` (doublon exact du
 * balisage local précédent) ; la colonne "État" convergeait vers son propre `statusBadgeClass()` local
 * (mapping de couleurs distinct du reste de l'app) au lieu de `&lt;TenderStatusBadge&gt;`, déjà le motif
 * de référence partagé par la Liste et le Kanban — jamais convergé ici (audit E5.1).
 */
export function PriorityTendersWidget({ items }: { items: DashboardAttentionItem[] }) {
  const visible = items.slice(0, DISPLAY_LIMIT);

  return (
    <Card
      title="Mes dossiers prioritaires"
      className="xl:col-span-2"
      actions={
        <Link href="/app/tenders" className="text-sm font-medium text-tenderos-blue hover:underline">
          Voir tous
        </Link>
      }
    >
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-tenderos-slate">Aucun dossier ne nécessite votre attention pour le moment.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-tenderos-navy/10 text-left text-xs uppercase tracking-wide text-tenderos-slate">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Dossier
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  État
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Échéance
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Progression
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.tenderId} className="border-b border-tenderos-navy/5 last:border-0 hover:bg-tenderos-light/50">
                  <td className="py-3 pr-3">
                    <Link href={`/app/tenders/${item.tenderId}`} className="block">
                      <span className="font-medium text-tenderos-navy">{item.title}</span>
                      <span className="block text-xs text-tenderos-slate">
                        {item.buyerName ?? "Acheteur non renseigné"}
                        {item.lotCount > 1 ? ` · ${item.lotCount} lots` : ""}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3 pr-3">
                    <TenderStatusBadge status={item.status} />
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-tenderos-navy">
                    {item.submissionDeadline ? new Date(item.submissionDeadline).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—"}
                    <span className="ml-1.5 text-xs text-tenderos-slate">{daysRemainingLabel(item.submissionDeadline, item.bucket)}</span>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tenderos-light">
                        <span className="block h-full rounded-full bg-tenderos-blue" style={{ width: `${Math.min(100, Math.max(0, item.readinessScore))}%` }} />
                      </span>
                      <span className="text-xs tabular-nums text-tenderos-slate">{item.readinessScore}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <AssigneeStack assignees={item.assignees} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
