import Link from "next/link";
import { TASK_STATUS_LABELS } from "../../../lib/workspace-types";
import type { DashboardMyTasks } from "../../../lib/dashboard-types";

const DISPLAY_LIMIT = 6;

function isOverdue(dueDate: string | undefined): boolean {
  return dueDate !== undefined && new Date(dueDate).getTime() < Date.now();
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E5 (Dashboard V2 addendum §17 "TASKS / ACTIONS") — `myTasks` était
 * déjà résolu par `GetDashboardOverviewUseCase` (via `GetMyTasksUseCase`, module Workspace) mais
 * jamais rendu sur cette page depuis le Sprint 25 (mission "documenter le gap sinon"). Ce module
 * Task permet une projection fiable (`/app/me/tasks` existe déjà) : réintroduit ici en lecture
 * seule, jamais un second gestionnaire de tâches.
 */
export function MyTasksWidget({ myTasks }: { myTasks: DashboardMyTasks }) {
  const visible = myTasks.items.slice(0, DISPLAY_LIMIT);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-tenderos-navy/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-tenderos-display text-base font-bold text-tenderos-navy">Mes tâches</h2>
          {myTasks.overdueCount > 0 ? <p className="text-xs font-medium text-red-600">{myTasks.overdueCount} en retard</p> : null}
        </div>
        <Link href="/app/me/tasks" className="text-sm font-medium text-tenderos-blue hover:underline">
          Voir tout
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-tenderos-slate">Aucune tâche assignée pour le moment.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <li key={task.id}>
              <Link href={`/app/tenders/${task.tenderId}/workspace`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-tenderos-light/60">
                <span className="truncate text-sm text-tenderos-navy">{task.title}</span>
                <span className={`shrink-0 whitespace-nowrap text-xs font-medium ${isOverdue(task.dueDate) ? "text-red-600" : "text-tenderos-slate"}`}>
                  {task.dueDate ? new Date(task.dueDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : TASK_STATUS_LABELS[task.status as keyof typeof TASK_STATUS_LABELS] ?? task.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
