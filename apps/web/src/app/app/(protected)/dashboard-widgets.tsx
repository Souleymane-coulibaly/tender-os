import Link from "next/link";
import { DEADLINE_BUCKET_LABELS, deadlineBucketBadgeClass, type DashboardActivityItem, type DashboardDeadlineItem } from "../../../lib/dashboard-types";

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
 */
function WidgetCard({ id, title, subtitle, action, children }: { id?: string; title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">{title}</h2>
          {subtitle ? <p className="text-xs text-tenderos-slate">{subtitle}</p> : null}
        </div>
        {action ? (
          <Link href={action.href} className="text-sm font-medium text-tenderos-blue hover:underline">
            {action.label}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function DeadlinesWidget({ deadlines }: { deadlines: DashboardDeadlineItem[] }) {
  return (
    <WidgetCard title="Prochaines échéances" action={{ href: "/app/tenders", label: "Voir le calendrier" }}>
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
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${deadlineBucketBadgeClass(item.bucket)}`}>{DEADLINE_BUCKET_LABELS[item.bucket]}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {deadlines.length > 6 ? <p className="text-xs text-tenderos-slate">+{deadlines.length - 6} autre(s)</p> : null}
    </WidgetCard>
  );
}

export function ActivityWidget({ activity }: { activity: DashboardActivityItem[] }) {
  return (
    <WidgetCard title="Activité récente" action={{ href: "/app/tenders", label: "Voir toute l'activité" }}>
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
    </WidgetCard>
  );
}
