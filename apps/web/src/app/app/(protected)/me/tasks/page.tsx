import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "../../../../../components/ui";
import { fetchMyTasks } from "../../../workspace-actions";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "../../../../../lib/workspace-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Mes tâches — TenderOS" };

type SearchParams = { status?: string; overdueOnly?: string };

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"];

/** Filtre de statut : l'actif est plein (navy), les autres discrets — liens de navigation (URL),
 *  jamais des boutons d'action, donc hors `Button` (même convention que la liste des opportunités). */
function filterClasses(active: boolean): string {
  return `rounded-lg px-2 py-1 font-medium transition ${active ? "bg-tenderos-navy text-white" : "border border-tenderos-navy/15 text-tenderos-slate hover:bg-tenderos-light"}`;
}

/** Variante « danger » du filtre « En retard » (l'ancien rouge brut, désormais jetons d'état). */
function overdueFilterClasses(active: boolean): string {
  return `rounded-lg px-2 py-1 font-medium transition ${active ? "bg-danger-fg text-white" : "border border-tenderos-navy/15 text-danger-fg hover:bg-danger-bg"}`;
}

/** V2 Sprint 7 §35 — respecte STRICTEMENT ClientAccess (voir `GetMyTasksUseCase` côté API) : cette
 *  page n'affiche jamais une tâche à laquelle l'utilisateur n'a pas réellement accès, quel que soit
 *  le filtre demandé — jamais un filtrage uniquement côté client. */
export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const status = params.status as TaskStatus | undefined;
  const overdueOnly = params.overdueOnly === "true";

  let tasks;
  try {
    tasks = await fetchMyTasks({
      ...(status ? { status } : {}),
      ...(overdueOnly ? { overdueOnly } : {}),
    });
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Mes tâches" }]}
        title="Mes tâches"
        description="Toutes les tâches qui vous sont assignées, dans les Tenders et entreprises candidates auxquels vous avez réellement accès."
      />

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/me/tasks" className={filterClasses(!status && !overdueOnly)}>
          Toutes
        </Link>
        {STATUSES.map((value) => (
          <Link key={value} href={`/app/me/tasks?status=${value}`} className={filterClasses(status === value)}>
            {TASK_STATUS_LABELS[value]}
          </Link>
        ))}
        <Link href="/app/me/tasks?overdueOnly=true" className={overdueFilterClasses(overdueOnly)}>
          En retard
        </Link>
      </nav>

      {tasks.length === 0 ? (
        <EmptyState title="Aucune tâche ne correspond à ce filtre." />
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-tenderos-navy/10">
            {tasks.map((task) => {
              const isOverdue =
                task.dueDate &&
                !["DONE", "CANCELLED"].includes(task.status) &&
                new Date(task.dueDate).getTime() < now;
              return (
                <li key={task.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <Link
                      href={`/app/tenders/${task.tenderId}/workspace`}
                      className="font-medium text-tenderos-navy hover:underline"
                    >
                      {task.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-tenderos-slate">
                      <Badge tone="neutral">{TASK_STATUS_LABELS[task.status]}</Badge>
                      <Badge tone="neutral">{TASK_PRIORITY_LABELS[task.priority]}</Badge>
                      {task.dueDate ? (
                        <span className={isOverdue ? "font-medium text-danger-fg" : ""}>
                          Échéance : {new Date(task.dueDate).toLocaleDateString("fr-FR")}
                        </span>
                      ) : (
                        <span>Sans échéance</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
