export { WorkspaceModule } from "./workspace.module";

// V2 Sprint 15 (Dashboard opérationnel) — réexportés UNIQUEMENT pour `dashboard` : "Mes tâches"
// (déjà scopé ClientAccess, mission §37/§38 "Mes tâches ≠ toutes les tâches") et le flux d'activité
// portfolio en LECTURE SEULE, jamais un second moteur Task/Activity dupliqué. Premier consommateur
// externe de ce module (aucun barrel n'existait avant ce sprint) — même motif de réexport ciblé que
// `response-package`/`opportunity` pour `chat` (Sprint 9).
export { GetMyTasksUseCase } from "./application/use-cases/get-my-tasks.use-case";
export type { GetMyTasksQuery } from "./application/use-cases/get-my-tasks.use-case";
export type { TaskSummary } from "./application/dtos";
export { TaskStatus, TaskPriority } from "./domain/task.entity";
export { ListRecentActivityForDashboardUseCase } from "./application/use-cases/list-recent-activity-for-dashboard.use-case";
export type { ListRecentActivityForDashboardQuery } from "./application/use-cases/list-recent-activity-for-dashboard.use-case";
export type { TenderActivityRecord } from "./application/ports/tender-activity.repository";
export { TenderActivityType } from "./domain/tender-activity-type";
