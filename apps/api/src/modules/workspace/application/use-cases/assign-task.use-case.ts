import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { assertHasTenderPermission, GetTenderUseCase, TenderPermission } from "../../../tenders";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { InvalidTaskAssigneeError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { isActiveTenderParticipant } from "../services/participant-eligibility";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { loadTask } from "./update-task.use-case";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type AssignTaskCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  taskId: string;
  actorId: string;
  actorRole: string;
  assigneeId?: string | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §17 — l'assignee doit être un `TenderParticipant` actif de CE Tender (mission : "un
 *  UUID utilisateur valide ne suffit pas"). `assigneeId: undefined` désassigne explicitement (zéro
 *  responsable, autorisé au Sprint 7 — mission §17 "zéro ou un responsable principal"). */
@Injectable()
export class AssignTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: AssignTaskCommand): Promise<TaskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    if (command.assigneeId !== undefined) {
      const eligible = await isActiveTenderParticipant(this.participantRepository, {
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        userId: command.assigneeId,
      });
      if (!eligible) {
        throw new InvalidTaskAssigneeError();
      }
    }

    // Correctif audit Codex P1-02 — sauvegarde métier + AuditLog + TenderActivity + Outbox dans UNE
    // SEULE transaction Postgres (tous les repositories/writers rejoignent déjà la transaction
    // ambiante via `PrismaService.currentClient()`) : rollback total si une étape échoue, jamais une
    // tâche assignée sans trace d'audit/activité/événement.
    const task = await this.atomicTransactionRunner.run(async () => {
      const task = await loadTask(this.taskRepository, { organizationId: command.organizationId, tenderId: command.tenderId, taskId: command.taskId });
      const previousAssigneeId = task.assigneeId;
      const occurredAt = this.clock.now();
      task.assign(command.assigneeId, occurredAt);
      await this.taskRepository.save(task);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.task_assigned",
        resourceType: "task",
        resourceId: task.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, previousAssigneeId, newAssigneeId: command.assigneeId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.TaskAssigned,
        summary: command.assigneeId ? `Tâche « ${task.title} » assignée.` : `Tâche « ${task.title} » désassignée.`,
        metadata: { taskId: task.id, assigneeId: command.assigneeId },
      });

      await this.outboxWriter.write({
        organizationId: command.organizationId,
        events: [
          {
            eventType: "TaskAssigned",
            aggregateType: "Task",
            aggregateId: task.id,
            payload: { tenderId: command.tenderId, assigneeId: command.assigneeId },
            occurredAt,
          },
        ],
      });

      return task;
    });

    return toTaskSummary(task);
  }
}
