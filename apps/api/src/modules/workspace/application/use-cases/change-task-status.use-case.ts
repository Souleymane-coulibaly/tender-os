import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TaskStatus } from "../../domain/task.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { loadTask } from "./update-task.use-case";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type ChangeTaskStatusCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  taskId: string;
  actorId: string;
  actorRole: string;
  status: TaskStatus;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §11 — transition contrôlée, jamais silencieuse : chaque changement de statut est
 *  tracé (`AuditLog.metadata` previousStatus/newStatus, Décision 6 du plan — pas de table
 *  d'historique dédiée) et projeté dans `TenderActivity` (TASK_COMPLETED/TASK_REOPENED pour les cas
 *  notables, TASK_STATUS_CHANGED sinon). `Task DONE` ≠ `ChecklistItem VALIDATED` : cette classe
 *  n'écrit JAMAIS l'état d'un ChecklistItem lié, même quand `task.checklistItemId` est renseigné
 *  (mission §13, règle absolue). */
@Injectable()
export class ChangeTaskStatusUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: ChangeTaskStatusCommand): Promise<TaskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity + Outbox dans UNE SEULE
    // transaction Postgres (voir AssignTaskUseCase pour la justification complète).
    const task = await this.atomicTransactionRunner.run(async () => {
      const task = await loadTask(this.taskRepository, { organizationId: command.organizationId, tenderId: command.tenderId, taskId: command.taskId });
      const previousStatus = task.status;
      const occurredAt = this.clock.now();
      task.changeStatus(command.status, command.actorId, occurredAt);
      await this.taskRepository.save(task);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.task_status_changed",
        resourceType: "task",
        resourceId: task.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, previousStatus, newStatus: command.status },
      });

      const activityType =
        command.status === TaskStatus.Done
          ? TenderActivityType.TaskCompleted
          : previousStatus === TaskStatus.Done
            ? TenderActivityType.TaskReopened
            : TenderActivityType.TaskStatusChanged;
      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: activityType,
        summary: `Tâche « ${task.title} » : ${previousStatus} → ${command.status}.`,
        metadata: { taskId: task.id, previousStatus, newStatus: command.status },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: command.status === TaskStatus.Done ? "TaskCompleted" : "TaskUpdated",
            aggregateType: "Task",
            aggregateId: task.id,
            payload: { tenderId: command.tenderId, previousStatus, newStatus: command.status },
            occurredAt,
          },
        ],
      });

      return task;
    });

    return toTaskSummary(task);
  }
}
