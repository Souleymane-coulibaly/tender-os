import { Inject, Injectable } from "@nestjs/common";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetTenderUseCase } from "../../../tenders";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { loadTask } from "./update-task.use-case";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type GetTaskQuery = Readonly<{ organizationId: string; tenderId: string; taskId: string; actorId: string; actorRole: string }>;

@Injectable()
export class GetTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(query: GetTaskQuery): Promise<TaskSummary> {
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      permission: ClientPermission.ReadWorkspace,
    });

    const task = await loadTask(this.taskRepository, { organizationId: query.organizationId, tenderId: query.tenderId, taskId: query.taskId });
    return toTaskSummary(task);
  }
}
