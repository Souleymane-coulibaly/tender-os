import { Module } from "@nestjs/common";
import { ClientPortfolioModule } from "../client-portfolio";
import { DocumentsModule } from "../documents";
import { IdentityModule } from "../identity";
import { MembershipsModule } from "../memberships";
import { OutboxModule } from "../outbox";
import { TendersModule } from "../tenders";

import { AUDIT_LOG_WRITER } from "./application/ports/audit-log-writer";
import { ATOMIC_TRANSACTION_RUNNER } from "./application/ports/atomic-transaction-runner";
import { APPROVAL_REQUEST_REPOSITORY } from "./application/ports/approval-request.repository";
import { COMMENT_REPOSITORY } from "./application/ports/comment.repository";
import { MENTION_REPOSITORY } from "./application/ports/mention.repository";
import { TASK_REPOSITORY } from "./application/ports/task.repository";
import { TENDER_ACTIVITY_REPOSITORY } from "./application/ports/tender-activity.repository";
import { TENDER_PARTICIPANT_REPOSITORY } from "./application/ports/tender-participant.repository";

import { TenderActivityRecorderService } from "./application/services/tender-activity-recorder.service";

import { AddTenderParticipantUseCase } from "./application/use-cases/add-tender-participant.use-case";
import { ChangeTenderParticipantRoleUseCase } from "./application/use-cases/change-tender-participant-role.use-case";
import { RemoveTenderParticipantUseCase } from "./application/use-cases/remove-tender-participant.use-case";
import { ListTenderParticipantsUseCase } from "./application/use-cases/list-tender-participants.use-case";
import { CreateTaskUseCase } from "./application/use-cases/create-task.use-case";
import { UpdateTaskUseCase } from "./application/use-cases/update-task.use-case";
import { AssignTaskUseCase } from "./application/use-cases/assign-task.use-case";
import { ChangeTaskStatusUseCase } from "./application/use-cases/change-task-status.use-case";
import { ListTasksUseCase } from "./application/use-cases/list-tasks.use-case";
import { GetTaskUseCase } from "./application/use-cases/get-task.use-case";
import { CreateCommentUseCase } from "./application/use-cases/create-comment.use-case";
import { EditCommentUseCase } from "./application/use-cases/edit-comment.use-case";
import { DeleteCommentUseCase } from "./application/use-cases/delete-comment.use-case";
import { ListCommentsUseCase } from "./application/use-cases/list-comments.use-case";
import { RequestApprovalUseCase } from "./application/use-cases/request-approval.use-case";
import { ApproveApprovalUseCase, RequestApprovalChangesUseCase } from "./application/use-cases/review-approval.use-case";
import { ListApprovalsUseCase } from "./application/use-cases/list-approvals.use-case";
import { GetTenderActivityUseCase } from "./application/use-cases/get-tender-activity.use-case";
import { GetMyTasksUseCase } from "./application/use-cases/get-my-tasks.use-case";
import { ListWorkspaceMembersUseCase } from "./application/use-cases/list-workspace-members.use-case";

import { PrismaAuditLogWriter } from "./infrastructure/prisma-audit-log.writer";
import { PrismaApprovalRequestRepository } from "./infrastructure/prisma-approval-request.repository";
import { PrismaCommentRepository } from "./infrastructure/prisma-comment.repository";
import { PrismaMentionRepository } from "./infrastructure/prisma-mention.repository";
import { PrismaTaskRepository } from "./infrastructure/prisma-task.repository";
import { PrismaTenderActivityRepository } from "./infrastructure/prisma-tender-activity.repository";
import { PrismaTenderParticipantRepository } from "./infrastructure/prisma-tender-participant.repository";
import { PrismaAtomicTransactionRunner } from "./infrastructure/prisma-atomic-transaction-runner";

import { WorkspaceController } from "./interfaces/http/workspace.controller";
import { MyTasksController } from "./interfaces/http/me-tasks.controller";

/**
 * V2 Sprint 7 — module cross-cutting entre `tenders` (Tender/TenderLot/ChecklistItem, propriétaires
 * de leurs modèles) et `documents`/`memberships`/`client-portfolio` (validation
 * documentId/participant/accès client). Même position dans le graphe de dépendances que
 * `checklist-intelligence`/`opportunity`/`ai-suggestion-bridge` : `documents` importe déjà
 * `TendersModule`, un import inverse depuis `tenders` créerait un cycle — `workspace` sits ABOVE,
 * jamais importé par `tenders`.
 */
@Module({
  imports: [IdentityModule, MembershipsModule, ClientPortfolioModule, TendersModule, DocumentsModule, OutboxModule],
  controllers: [WorkspaceController, MyTasksController],
  providers: [
    TenderActivityRecorderService,

    AddTenderParticipantUseCase,
    ChangeTenderParticipantRoleUseCase,
    RemoveTenderParticipantUseCase,
    ListTenderParticipantsUseCase,

    CreateTaskUseCase,
    UpdateTaskUseCase,
    AssignTaskUseCase,
    ChangeTaskStatusUseCase,
    ListTasksUseCase,
    GetTaskUseCase,

    CreateCommentUseCase,
    EditCommentUseCase,
    DeleteCommentUseCase,
    ListCommentsUseCase,

    RequestApprovalUseCase,
    ApproveApprovalUseCase,
    RequestApprovalChangesUseCase,
    ListApprovalsUseCase,

    GetTenderActivityUseCase,
    GetMyTasksUseCase,
    ListWorkspaceMembersUseCase,

    { provide: TENDER_PARTICIPANT_REPOSITORY, useClass: PrismaTenderParticipantRepository },
    { provide: TASK_REPOSITORY, useClass: PrismaTaskRepository },
    { provide: COMMENT_REPOSITORY, useClass: PrismaCommentRepository },
    { provide: MENTION_REPOSITORY, useClass: PrismaMentionRepository },
    { provide: APPROVAL_REQUEST_REPOSITORY, useClass: PrismaApprovalRequestRepository },
    { provide: TENDER_ACTIVITY_REPOSITORY, useClass: PrismaTenderActivityRepository },
    { provide: AUDIT_LOG_WRITER, useClass: PrismaAuditLogWriter },
    { provide: ATOMIC_TRANSACTION_RUNNER, useClass: PrismaAtomicTransactionRunner },
  ],
})
export class WorkspaceModule {}
