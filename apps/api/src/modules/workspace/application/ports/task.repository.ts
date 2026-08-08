import type { TaskPriority, TaskStatus } from "../../domain/task.entity";
import type { Task } from "../../domain/task.entity";

export type TaskListFilters = {
  status?: readonly TaskStatus[] | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: string | undefined;
  lotId?: string | null | undefined;
  checklistItemId?: string | undefined;
  overdueOnly?: boolean | undefined;
  dueSoonBefore?: Date | undefined;
};

export interface TaskRepository {
  findById(input: { organizationId: string; tenderId: string; taskId: string }): Promise<Task | null>;
  listByTender(input: { organizationId: string; tenderId: string } & TaskListFilters): Promise<Task[]>;
  /** V2 Sprint 7 §35 — "Mes tâches" : filtré par assignee ET, si `restrictToClientAccountIds` est
   *  fourni (acteur sans accès global), restreint aux tâches dont le Tender appartient à l'une de
   *  ces entreprises candidates (jointure, jamais un filtrage en mémoire après chargement complet —
   *  même discipline que `TenderRepository.list`). `undefined` = accès à tous les clients
   *  (OWNER/ORGANIZATION_ADMIN). */
  listByAssignee(input: { organizationId: string; assigneeId: string; restrictToClientAccountIds?: readonly string[] | undefined } & TaskListFilters): Promise<Task[]>;
  save(task: Task): Promise<void>;
}

export const TASK_REPOSITORY = Symbol("TASK_REPOSITORY");
