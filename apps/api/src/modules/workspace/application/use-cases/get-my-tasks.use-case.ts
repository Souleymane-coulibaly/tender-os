import { Inject, Injectable } from "@nestjs/common";
import { ListAccessibleClientsUseCase } from "../../../client-portfolio";
import type { TaskListFilters } from "../ports/task.repository";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type GetMyTasksQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string } & TaskListFilters>;

/** V2 Sprint 7 §35 — "Mes tâches" respecte STRICTEMENT ClientAccess (mission, règle absolue) :
 *  réutilise `ListAccessibleClientsUseCase` (déjà consommé par `ListTendersUseCase`, même motif),
 *  jamais un filtrage en mémoire après chargement complet — la restriction est appliquée par le
 *  repository via une jointure sur `tenders.client_account_id`. */
@Injectable()
export class GetMyTasksUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    private readonly listAccessibleClientsUseCase: ListAccessibleClientsUseCase,
  ) {}

  async execute(query: GetMyTasksQuery): Promise<TaskSummary[]> {
    const accessible = await this.listAccessibleClientsUseCase.execute({ organizationId: query.organizationId, actorId: query.actorId, actorRole: query.actorRole });
    if (!accessible.allClients && accessible.clientAccountIds.length === 0) {
      return [];
    }

    const tasks = await this.taskRepository.listByAssignee({
      organizationId: query.organizationId,
      assigneeId: query.actorId,
      restrictToClientAccountIds: accessible.allClients ? undefined : accessible.clientAccountIds,
      status: query.status,
      priority: query.priority,
      lotId: query.lotId,
      overdueOnly: query.overdueOnly,
      dueSoonBefore: query.dueSoonBefore,
    });
    return tasks.map(toTaskSummary);
  }
}
