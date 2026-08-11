import Link from "next/link";
import {
  ATTENTION_REASON_LABELS,
  DEADLINE_BUCKET_LABELS,
  GO_NO_GO_LABELS,
  deadlineBucketBadgeClass,
  goNoGoBadgeClass,
  type DashboardActivityItem,
  type DashboardAttentionItem,
  type DashboardDeadlineItem,
  type DashboardGoNoGo,
  type DashboardMyTasks,
  type DashboardPackages,
  type DashboardPipelineStage,
} from "../../../lib/dashboard-types";
import { RESPONSE_PACKAGE_STATUS_LABELS, responsePackageStatusBadgeClass } from "../../../lib/response-package-types";
import { TASK_STATUS_LABELS } from "../../../lib/workspace-types";
import { TENDER_STATUS_LABELS } from "../../../lib/tenders-types";

/** Carte KPI — chiffre unique, actionnable si `href` est fourni (mission §22 "clic → vue filtrée
 *  correspondante"). Tonalité sémantique séparée de l'accent (mission "semantic color... ne compte
 *  pas comme l'accent"). */
export function KpiCard({ label, value, href, tone }: { label: string; value: number | string; href?: string | undefined; tone?: "warning" | "critical" | "good" | undefined }) {
  const toneClass =
    tone === "critical"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "good"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-neutral-200 bg-white text-neutral-900";

  const content = (
    <div className={`flex h-full flex-col gap-1 rounded border px-4 py-3 ${toneClass} ${href ? "transition hover:border-neutral-400" : ""}`}>
      <span className="text-xs uppercase tracking-wide opacity-70">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded border border-dashed border-neutral-300 p-6 text-sm">
      <p className="font-medium text-neutral-800">{title}</p>
      <p className="text-neutral-500">{description}</p>
      {action ? (
        <Link href={action.href} className="mt-1 rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function WidgetCard({ id, title, subtitle, children }: { id?: string | undefined; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
      <div>
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {subtitle ? <p className="text-xs text-neutral-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Barre horizontale proportionnelle — pas de librairie de charts (décision Sprint 15), labels et
 *  valeurs toujours affichés en texte (mission §47 "jamais uniquement par la couleur"). */
export function PipelineWidget({ pipeline }: { pipeline: DashboardPipelineStage[] }) {
  const total = pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const orderedStages = pipeline.filter((stage) => stage.count > 0 || TENDER_STATUS_LABELS[stage.status]);

  return (
    <WidgetCard title="Pipeline des appels d'offres" subtitle={`${total} dossier(s)`}>
      {total === 0 ? (
        <EmptyState title="Aucun appel d'offres actif." description="Créez ou promouvez une opportunité pour voir apparaître le pipeline." action={{ href: "/app/tenders", label: "Voir les appels d'offres" }} />
      ) : (
        <ul className="flex flex-col gap-2">
          {orderedStages.map((stage) => (
            <li key={stage.status}>
              <Link href={`/app/tenders?status=${stage.status}`} className="group flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate text-neutral-600 group-hover:text-neutral-900">{TENDER_STATUS_LABELS[stage.status] ?? stage.status}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <span className="block h-full rounded-full bg-neutral-700" style={{ width: total > 0 ? `${Math.max((stage.count / total) * 100, stage.count > 0 ? 4 : 0)}%` : "0%" }} />
                </span>
                <span className="w-8 shrink-0 text-right font-medium tabular-nums">{stage.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function DeadlinesWidget({ deadlines }: { deadlines: DashboardDeadlineItem[] }) {
  return (
    <WidgetCard title="Échéances" subtitle="Aujourd'hui, demain, cette semaine">
      {deadlines.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune échéance à venir.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {deadlines.slice(0, 8).map((item) => (
            <li key={item.tenderId}>
              <Link href={`/app/tenders/${item.tenderId}`} className="flex items-center justify-between gap-3 rounded px-1 py-1 text-sm hover:bg-neutral-50">
                <span className="truncate text-neutral-800">{item.title}</span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-xs text-neutral-500">{new Date(item.submissionDeadline).toLocaleDateString("fr-FR")}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${deadlineBucketBadgeClass(item.bucket)}`}>{DEADLINE_BUCKET_LABELS[item.bucket]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {deadlines.length > 8 ? <p className="text-xs text-neutral-500">+{deadlines.length - 8} autre(s)</p> : null}
    </WidgetCard>
  );
}

export function AttentionWidget({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <WidgetCard id="attention" title="Dossiers à traiter" subtitle="Deadline proche, pièce manquante, dossier non prêt">
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun dossier ne nécessite votre attention pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.slice(0, 10).map((item) => (
            <li key={item.tenderId} className="rounded border border-neutral-100 p-2">
              <Link href={`/app/tenders/${item.tenderId}`} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">{item.title}</span>
                  <span className="whitespace-nowrap text-xs text-neutral-500 tabular-nums">Score {item.readinessScore}/100</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.bucket ? <span className={`rounded px-2 py-0.5 text-xs font-medium ${deadlineBucketBadgeClass(item.bucket)}`}>{DEADLINE_BUCKET_LABELS[item.bucket]}</span> : null}
                  {item.reasons.map((reason) => (
                    <span key={reason} className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                      {ATTENTION_REASON_LABELS[reason]}
                    </span>
                  ))}
                </div>
                {item.lotPackages.length > 1 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {item.lotPackages.map((pkg, index) => (
                      <span key={`${item.tenderId}-${pkg.lotId ?? "global"}-${index}`} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${responsePackageStatusBadgeClass(pkg.status)}`}>
                        Lot {index + 1} : {RESPONSE_PACKAGE_STATUS_LABELS[pkg.status]}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 10 ? (
        <Link href="/app/tenders" className="text-xs text-neutral-600 hover:underline">
          +{items.length - 10} autre(s) dossier(s) — voir la liste complète
        </Link>
      ) : null}
    </WidgetCard>
  );
}

export function MyTasksWidget({ tasks }: { tasks: DashboardMyTasks }) {
  return (
    <WidgetCard title="Mes tâches" subtitle={tasks.overdueCount > 0 ? `${tasks.overdueCount} en retard` : "À jour"}>
      {tasks.items.length === 0 ? (
        <EmptyState title="Aucune tâche assignée." description="Les tâches qui vous sont confiées dans les dossiers apparaîtront ici." />
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.items.map((task) => (
            <li key={task.id}>
              <Link href={`/app/tenders/${task.tenderId}/workspace`} className="flex items-center justify-between gap-3 rounded px-1 py-1 text-sm hover:bg-neutral-50">
                <span className="truncate text-neutral-800">{task.title}</span>
                <span className="flex items-center gap-2 whitespace-nowrap text-xs text-neutral-500">
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString("fr-FR") : "—"}
                  <span className="rounded bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700">{TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS] ?? task.status}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href="/app/me/tasks" className="text-xs text-neutral-600 hover:underline">
        Voir toutes mes tâches →
      </Link>
    </WidgetCard>
  );
}

export function ActivityWidget({ activity }: { activity: DashboardActivityItem[] }) {
  return (
    <WidgetCard title="Activité récente">
      {activity.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune activité récente sur vos dossiers.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {activity.map((entry) => (
            <li key={entry.id}>
              <Link href={`/app/tenders/${entry.tenderId}/workspace`} className="flex items-center justify-between gap-3 rounded px-1 py-1 text-sm hover:bg-neutral-50">
                <span className="truncate text-neutral-700">{entry.summary}</span>
                <span className="whitespace-nowrap text-xs text-neutral-400">{new Date(entry.createdAt).toLocaleDateString("fr-FR")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export function GoNoGoWidget({ goNoGo }: { goNoGo: DashboardGoNoGo }) {
  const decisions: Array<keyof typeof GO_NO_GO_LABELS> = ["GO", "GO_CONDITIONAL", "NO_GO"];
  return (
    <WidgetCard title="Décisions GO/NO-GO" subtitle={`${goNoGo.total} décision(s) sur ${goNoGo.periodDays} jours`}>
      {goNoGo.total === 0 ? (
        <p className="text-sm text-neutral-500">Aucune décision enregistrée sur la période.</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label={decisions.map((d) => `${GO_NO_GO_LABELS[d]} : ${goNoGo.countByDecision[d] ?? 0}`).join(", ")}>
            {decisions.map((decision) => {
              const count = goNoGo.countByDecision[decision] ?? 0;
              const width = goNoGo.total > 0 ? (count / goNoGo.total) * 100 : 0;
              if (width === 0) return null;
              const barColor = decision === "GO" ? "bg-green-500" : decision === "GO_CONDITIONAL" ? "bg-amber-500" : "bg-red-500";
              return <span key={decision} className={barColor} style={{ width: `${width}%` }} />;
            })}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {decisions.map((decision) => (
              <li key={decision} className="flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 font-medium ${goNoGoBadgeClass(decision)}`}>{GO_NO_GO_LABELS[decision]}</span>
                <span className="tabular-nums text-neutral-600">{goNoGo.countByDecision[decision] ?? 0}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

export function PackagesWidget({ packages }: { packages: DashboardPackages }) {
  const statuses: Array<keyof typeof RESPONSE_PACKAGE_STATUS_LABELS> = ["DRAFT", "IN_REVIEW", "READY", "VALIDATED", "EXPORTED", "INVALIDATED"];
  return (
    <WidgetCard title="Dossiers de réponse" subtitle={`${packages.total} dossier(s) créé(s)`}>
      {packages.total === 0 ? (
        <EmptyState title="Aucun dossier de réponse créé." description="Un dossier de réponse s'assemble depuis la fiche d'un appel d'offres." />
      ) : (
        <ul className="flex flex-wrap gap-2">
          {statuses
            .filter((status) => (packages.countByStatus[status] ?? 0) > 0)
            .map((status) => (
              <li key={status} className={`rounded px-2 py-1 text-xs font-medium ${responsePackageStatusBadgeClass(status)}`}>
                {RESPONSE_PACKAGE_STATUS_LABELS[status]} · <span className="tabular-nums">{packages.countByStatus[status]}</span>
              </li>
            ))}
        </ul>
      )}
    </WidgetCard>
  );
}
