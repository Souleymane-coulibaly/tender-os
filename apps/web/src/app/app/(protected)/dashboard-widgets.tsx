import Link from "next/link";
import { Badge, Card } from "../../../components/ui";
import { DEADLINE_BUCKET_LABELS, deadlineBucketTone, type DashboardActivityItem, type DashboardDeadlineItem } from "../../../lib/dashboard-types";

/**
 * V2 Sprint 25 (Dashboard Premium) — mission §25.54-§25.68 : `PipelineWidget`/`AttentionWidget`/
 * `MyTasksWidget`/`PackagesWidget`/`GoNoGoWidget`/`KpiCard` (Sprint 15) sont retirés de cette page,
 * remplacés par le nouveau jeu de widgets validé (KPI row, `PriorityTendersWidget`,
 * `UsageWidget`, `MarketWatchWidget`, `QuickActionsPanel`) — le maquettage validé ne les inclut pas
 * comme sections séparées de l'aperçu (mission "centre de pilotage", pas un tableau de bord dense).
 * Leurs données restent accessibles ailleurs (Pipeline → `/app/tenders`, Packages → dossier de
 * réponse, GO/NO-GO → fiche Opportunité, Tâches → `/app/me/tasks`) — rien n'est supprimé côté
 * backend, seulement retiré de CETTE vue. `DeadlinesWidget`/`ActivityWidget` restent (même contrat
 * de données, uniquement restylés premium).
 *
 * Checkpoint TENDEROS-2.1-P2.3-E5.1 (Design System V2) — l'ancien `WidgetCard` local (retiré)
 * dupliquait exactement le balisage de `&lt;Card&gt;` ; `action` migre vers le slot `actions` de
 * `Card`. Le badge d'échéance utilise désormais `&lt;Badge tone={deadlineBucketTone(...)}&gt;` au lieu
 * de classes Tailwind brutes (`deadlineBucketBadgeClass`, supprimée — un seul appelant, ici).
 */

export function DeadlinesWidget({ deadlines }: { deadlines: DashboardDeadlineItem[] }) {
  return (
    <Card
      title="Prochaines échéances"
      actions={
        <Link href="/app/tenders" className="text-sm font-medium text-tenderos-blue hover:underline">
          Voir le calendrier
        </Link>
      }
    >
      {deadlines.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune échéance à venir.</p>
      ) : (
        <ol className="flex flex-col gap-3 border-l-2 border-tenderos-light pl-4">
          {deadlines.slice(0, 6).map((item) => (
            <li key={item.tenderId} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-tenderos-blue" aria-hidden="true" />
              <Link href={`/app/tenders/${item.tenderId}`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 hover:bg-tenderos-light/60">
                <div className="min-w-0">
                  <span className="block text-xs font-semibold uppercase text-tenderos-slate">{new Date(item.submissionDeadline).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}</span>
                  <span className="block truncate text-sm font-medium text-tenderos-navy">{item.title}</span>
                  <span className="block text-xs text-tenderos-slate">Remise des offres</span>
                </div>
                <span className="shrink-0">
                  <Badge tone={deadlineBucketTone(item.bucket)}>{DEADLINE_BUCKET_LABELS[item.bucket]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {deadlines.length > 6 ? <p className="text-xs text-tenderos-slate">+{deadlines.length - 6} autre(s)</p> : null}
    </Card>
  );
}

export function ActivityWidget({ activity }: { activity: DashboardActivityItem[] }) {
  return (
    <Card
      title="Activité récente"
      actions={
        <Link href="/app/tenders" className="text-sm font-medium text-tenderos-blue hover:underline">
          Voir toute l&apos;activité
        </Link>
      }
    >
      {activity.length === 0 ? (
        <p className="text-sm text-tenderos-slate">Aucune activité récente sur vos dossiers.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activity.slice(0, 6).map((entry) => (
            <li key={entry.id}>
              <Link href={`/app/tenders/${entry.tenderId}/workspace`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-tenderos-light/60">
                <span className="truncate text-sm text-tenderos-navy">{entry.summary}</span>
                <span className="shrink-0 whitespace-nowrap text-xs text-tenderos-slate">{new Date(entry.createdAt).toLocaleDateString("fr-FR")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
