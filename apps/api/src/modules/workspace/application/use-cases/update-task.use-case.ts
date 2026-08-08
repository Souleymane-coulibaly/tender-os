import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, assertLotBelongsToTender, GetTenderUseCase, TENDER_LOT_REPOSITORY, TenderPermission, type TenderLotRepository } from "../../../tenders";
import type { Task, TaskPriority } from "../../domain/task.entity";
import { TaskNotFoundError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type UpdateTaskCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  taskId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  priority?: TaskPriority | undefined;
  dueDate?: string | undefined;
  lotId?: string | undefined;
  requestId?: string | undefined;
}>;

export async function loadTask(repository: TaskRepository, input: { organizationId: string; tenderId: string; taskId: string }): Promise<Task> {
  const task = await repository.findById(input);
  if (!task) {
    throw new TaskNotFoundError();
  }
  return task;
}

@Injectable()
export class UpdateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateTaskCommand): Promise<TaskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    if (command.lotId !== undefined) {
      await assertLotBelongsToTender(this.lotRepository, { organizationId: command.organizationId, tenderId: command.tenderId, lotId: command.lotId });
    }

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog dans UNE SEULE transaction Postgres.
    const task = await this.atomicTransactionRunner.run(async () => {
      const task = await loadTask(this.taskRepository, { organizationId: command.organizationId, tenderId: command.tenderId, taskId: command.taskId });
      const previousLotId = task.lotId;
      const occurredAt = this.clock.now();

      task.update(
        {
          title: command.title,
          description: command.description,
          priority: command.priority,
          dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
        },
        occurredAt,
      );
      if (command.lotId !== undefined) {
        task.changeLot(command.lotId, occurredAt);
      }
      await this.taskRepository.save(task);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.task_updated",
        resourceType: "task",
        resourceId: task.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId },
      });

      if (command.lotId !== undefined && command.lotId !== previousLotId) {
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorId: command.actorId,
          action: "workspace.task_lot_changed",
          resourceType: "task",
          resourceId: task.id,
          requestId: command.requestId,
          metadata: { tenderId: command.tenderId, previousLotId, newLotId: command.lotId },
        });
      }

      return task;
    });

    return toTaskSummary(task);
  }
}
