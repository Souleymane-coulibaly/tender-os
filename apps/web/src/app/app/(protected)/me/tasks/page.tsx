import type { Metadata } from "next";
import Link from "next/link";
import { fetchMyTasks } from "../../../workspace-actions";
import { TASK_STATUS_LABELS, type TaskStatus } from "../../../../../lib/workspace-types";
import { ApiErrorState } from "../../api-error-state";

export const metadata: Metadata = { title: "Mes tâches — TenderOS" };

type SearchParams = { status?: string; overdueOnly?: string };

const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"];

/** V2 Sprint 7 §35 — respecte STRICTEMENT ClientAccess (voir `GetMyTasksUseCase` côté API) : cette
 *  page n'affiche jamais une tâche à laquelle l'utilisateur n'a pas réellement accès, quel que soit
 *  le filtre demandé — jamais un filtrage uniquement côté client. */
export default async function MyTasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const status = params.status as TaskStatus | undefined;
  const overdueOnly = params.overdueOnly === "true";

  let tasks;
  try {
    tasks = await fetchMyTasks({ ...(status ? { status } : {}), ...(overdueOnly ? { overdueOnly } : {}) });
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Mes tâches</h1>
        <p className="text-sm text-neutral-600">Toutes les tâches qui vous sont assignées, dans les Tenders et entreprises candidates auxquels vous avez réellement accès.</p>
      </div>

      <nav className="flex flex-wrap gap-2 text-xs">
        <Link href="/app/me/tasks" className={`rounded px-2 py-1 ${!status && !overdueOnly ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}>
          Toutes
        </Link>
        {STATUSES.map((value) => (
          <Link
            key={value}
            href={`/app/me/tasks?status=${value}`}
            className={`rounded px-2 py-1 ${status === value ? "bg-neutral-900 text-white" : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100"}`}
          >
            {TASK_STATUS_LABELS[value]}
          </Link>
        ))}
        <Link href="/app/me/tasks?overdueOnly=true" className={`rounded px-2 py-1 ${overdueOnly ? "bg-red-700 text-white" : "border border-red-300 text-red-700 hover:bg-red-50"}`}>
          En retard
        </Link>
      </nav>

      {tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune tâche ne correspond à ce filtre.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => {
            const isOverdue = task.dueDate && !["DONE", "CANCELLED"].includes(task.status) && new Date(task.dueDate).getTime() < now;
            return (
              <li key={task.id} className="flex items-center justify-between gap-3 rounded border border-neutral-200 p-2 text-sm">
                <div className="flex flex-col gap-0.5">
                  <Link href={`/app/tenders/${task.tenderId}/workspace`} className="font-medium text-neutral-900 hover:underline">
                    {task.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-600">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">{TASK_STATUS_LABELS[task.status]}</span>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5">{task.priority}</span>
                    {task.dueDate ? (
                      <span className={isOverdue ? "font-medium text-red-700" : ""}>Échéance : {new Date(task.dueDate).toLocaleDateString("fr-FR")}</span>
                    ) : (
                      <span>Sans échéance</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
