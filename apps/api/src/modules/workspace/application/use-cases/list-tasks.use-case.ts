import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import type { TaskListFilters } from "../ports/task.repository";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type ListTasksQuery = Readonly<{ organizationId: string; tenderId: string; actorId: string; actorRole: string } & TaskListFilters>;

@Injectable()
export class ListTasksUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: ListTasksQuery): Promise<TaskSummary[]> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const tasks = await this.taskRepository.listByTender({
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      status: query.status,
      priority: query.priority,
      assigneeId: query.assigneeId,
      lotId: query.lotId,
      checklistItemId: query.checklistItemId,
      overdueOnly: query.overdueOnly,
      dueSoonBefore: query.dueSoonBefore,
    });
    return tasks.map(toTaskSummary);
  }
}
