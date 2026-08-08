import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission } from "../../../client-portfolio";
import { GetDocumentUseCase } from "../../../documents";
import { OUTBOX_WRITER, type OutboxEventInput, type OutboxWriter } from "../../../outbox";
import {
  assertHasTenderPermission,
  assertLotBelongsToTender,
  CHECKLIST_ITEM_REPOSITORY,
  GetTenderUseCase,
  loadChecklistItem,
  TENDER_LOT_REPOSITORY,
  TenderPermission,
  type ChecklistItemRepository,
  type TenderLotRepository,
} from "../../../tenders";
import { Task, type TaskPriority } from "../../domain/task.entity";
import { TenderActivityType } from "../../domain/tender-activity-type";
import { InvalidTaskAssigneeError } from "../../domain/errors";
import { assertWorkspaceAccess } from "../policies/workspace-authorization.policy";
import { isActiveTenderParticipant } from "../services/participant-eligibility";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TASK_REPOSITORY, type TaskRepository } from "../ports/task.repository";
import { TENDER_PARTICIPANT_REPOSITORY, type TenderParticipantRepository } from "../ports/tender-participant.repository";
import { TenderActivityRecorderService } from "../services/tender-activity-recorder.service";
import { toTaskSummary, type TaskSummary } from "../dtos";

export type CreateTaskCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  title: string;
  description?: string | undefined;
  priority?: TaskPriority | undefined;
  dueDate?: string | undefined;
  lotId?: string | undefined;
  checklistItemId?: string | undefined;
  documentId?: string | undefined;
  assigneeId?: string | undefined;
  requestId?: string | undefined;
}>;

/** V2 Sprint 7 §13-14 — une tâche PEUT naître d'un ChecklistItem ("Créer une tâche") mais reste
 *  toujours créée TODO, jamais pré-assignée par l'IA (mission §14 "laisser l'utilisateur
 *  confirmer... ne pas affecter automatiquement un utilisateur par IA"). */
@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepository: TaskRepository,
    @Inject(TENDER_PARTICIPANT_REPOSITORY) private readonly participantRepository: TenderParticipantRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly activityRecorder: TenderActivityRecorderService,
  ) {}

  async execute(command: CreateTaskCommand): Promise<TaskSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.ManageWorkspace);
    await assertWorkspaceAccess(this.getTenderUseCase, this.assertClientAccessUseCase, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ManageWorkspace,
    });

    await assertLotBelongsToTender(this.lotRepository, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });

    if (command.checklistItemId !== undefined) {
      // Lève ChecklistItemNotFoundError si l'item n'existe pas ou n'appartient pas à ce Tender —
      // jamais un `findUnique({id})` nu (mission §44 "anti-IDOR").
      await loadChecklistItem(this.checklistItemRepository, {
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        itemId: command.checklistItemId,
      });
    }

    if (command.documentId !== undefined) {
      // Organisation-scopé — jamais un documentId d'une autre organisation silencieusement accepté.
      await this.getDocumentUseCase.execute({
        organizationId: command.organizationId,
        documentId: command.documentId,
        actorRole: command.actorRole,
        actorId: command.actorId,
      });
    }

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

    // Correctif audit Codex P1-02 — sauvegarde + AuditLog + TenderActivity + Outbox dans UNE SEULE
    // transaction Postgres (voir AssignTaskUseCase pour la justification complète).
    const task = await this.atomicTransactionRunner.run(async () => {
      const occurredAt = this.clock.now();
      const task = Task.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        lotId: command.lotId,
        checklistItemId: command.checklistItemId,
        documentId: command.documentId,
        title: command.title,
        description: command.description,
        priority: command.priority,
        dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
        assigneeId: command.assigneeId,
        createdBy: command.actorId,
        occurredAt,
      });
      await this.taskRepository.save(task);

      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorId: command.actorId,
        action: "workspace.task_created",
        resourceType: "task",
        resourceId: task.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, checklistItemId: command.checklistItemId, lotId: command.lotId },
      });

      await this.activityRecorder.record({
        organizationId: command.organizationId,
        tenderId: command.tenderId,
        actorId: command.actorId,
        type: TenderActivityType.TaskCreated,
        summary: `Tâche créée : « ${task.title} ».`,
        metadata: { taskId: task.id },
      });

      if (command.assigneeId !== undefined) {
        await this.activityRecorder.record({
          organizationId: command.organizationId,
          tenderId: command.tenderId,
          actorId: command.actorId,
          type: TenderActivityType.TaskAssigned,
          summary: `Tâche « ${task.title} » assignée.`,
          metadata: { taskId: task.id, assigneeId: command.assigneeId },
        });
      }

      const events: OutboxEventInput[] = [
        {
          eventType: "TaskCreated",
          aggregateType: "Task",
          aggregateId: task.id,
          payload: { tenderId: command.tenderId, title: task.title },
          occurredAt,
        },
      ];
      if (command.assigneeId !== undefined) {
        events.push({
          eventType: "TaskAssigned",
          aggregateType: "Task",
          aggregateId: task.id,
          payload: { tenderId: command.tenderId, assigneeId: command.assigneeId },
          occurredAt,
        });
      }
      await this.outboxWriter.write({ organizationId: command.organizationId, events });

      return task;
    });

    return toTaskSummary(task);
  }
}
