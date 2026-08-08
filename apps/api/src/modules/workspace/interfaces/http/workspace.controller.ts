import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { AddTenderParticipantUseCase } from "../../application/use-cases/add-tender-participant.use-case";
import { ChangeTenderParticipantRoleUseCase } from "../../application/use-cases/change-tender-participant-role.use-case";
import { RemoveTenderParticipantUseCase } from "../../application/use-cases/remove-tender-participant.use-case";
import { ListTenderParticipantsUseCase } from "../../application/use-cases/list-tender-participants.use-case";
import { CreateTaskUseCase } from "../../application/use-cases/create-task.use-case";
import { UpdateTaskUseCase } from "../../application/use-cases/update-task.use-case";
import { AssignTaskUseCase } from "../../application/use-cases/assign-task.use-case";
import { ChangeTaskStatusUseCase } from "../../application/use-cases/change-task-status.use-case";
import { ListTasksUseCase } from "../../application/use-cases/list-tasks.use-case";
import { GetTaskUseCase } from "../../application/use-cases/get-task.use-case";
import { CreateCommentUseCase } from "../../application/use-cases/create-comment.use-case";
import { EditCommentUseCase } from "../../application/use-cases/edit-comment.use-case";
import { DeleteCommentUseCase } from "../../application/use-cases/delete-comment.use-case";
import { ListCommentsUseCase } from "../../application/use-cases/list-comments.use-case";
import { RequestApprovalUseCase } from "../../application/use-cases/request-approval.use-case";
import { ApproveApprovalUseCase, RequestApprovalChangesUseCase } from "../../application/use-cases/review-approval.use-case";
import { ListApprovalsUseCase } from "../../application/use-cases/list-approvals.use-case";
import { GetTenderActivityUseCase } from "../../application/use-cases/get-tender-activity.use-case";
import { ListWorkspaceMembersUseCase } from "../../application/use-cases/list-workspace-members.use-case";
import { TaskStatus } from "../../domain/task.entity";
import { WorkspaceErrorFilter } from "./workspace-error.filter";
import {
  AddTenderParticipantBodySchema,
  ActivityQuerySchema,
  AssignTaskBodySchema,
  ChangeTaskStatusBodySchema,
  ChangeTenderParticipantRoleBodySchema,
  CreateCommentBodySchema,
  CreateTaskBodySchema,
  EditCommentBodySchema,
  IdParamSchema,
  ListCommentsQuerySchema,
  ListTasksQuerySchema,
  RequestApprovalBodySchema,
  ReviewApprovalBodySchema,
  UpdateTaskBodySchema,
  type AddTenderParticipantBody,
  type ActivityQuery,
  type AssignTaskBody,
  type ChangeTaskStatusBody,
  type ChangeTenderParticipantRoleBody,
  type CreateCommentBody,
  type CreateTaskBody,
  type EditCommentBody,
  type ListCommentsQuery,
  type ListTasksQuery,
  type RequestApprovalBody,
  type ReviewApprovalBody,
  type UpdateTaskBody,
} from "./schemas";

/** V2 Sprint 7 — Workspace collaboratif (participants, tâches, commentaires, mentions,
 *  approbations, activité). Même préfixe `tenders` que `TendersController`/
 *  `ChecklistIntelligenceController` : routes distinctes, aucune collision (mission §43 "adapter
 *  aux conventions API réelles" — ce dépôt imbrique systématiquement les sous-ressources sous
 *  `/tenders/:id/...`, jamais de ressource top-level bare). */
@Controller("tenders")
@UseFilters(WorkspaceErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class WorkspaceController {
  constructor(
    private readonly addParticipantUseCase: AddTenderParticipantUseCase,
    private readonly changeParticipantRoleUseCase: ChangeTenderParticipantRoleUseCase,
    private readonly removeParticipantUseCase: RemoveTenderParticipantUseCase,
    private readonly listParticipantsUseCase: ListTenderParticipantsUseCase,
    private readonly createTaskUseCase: CreateTaskUseCase,
    private readonly updateTaskUseCase: UpdateTaskUseCase,
    private readonly assignTaskUseCase: AssignTaskUseCase,
    private readonly changeTaskStatusUseCase: ChangeTaskStatusUseCase,
    private readonly listTasksUseCase: ListTasksUseCase,
    private readonly getTaskUseCase: GetTaskUseCase,
    private readonly createCommentUseCase: CreateCommentUseCase,
    private readonly editCommentUseCase: EditCommentUseCase,
    private readonly deleteCommentUseCase: DeleteCommentUseCase,
    private readonly listCommentsUseCase: ListCommentsUseCase,
    private readonly requestApprovalUseCase: RequestApprovalUseCase,
    private readonly approveApprovalUseCase: ApproveApprovalUseCase,
    private readonly requestApprovalChangesUseCase: RequestApprovalChangesUseCase,
    private readonly listApprovalsUseCase: ListApprovalsUseCase,
    private readonly getTenderActivityUseCase: GetTenderActivityUseCase,
    private readonly listWorkspaceMembersUseCase: ListWorkspaceMembersUseCase,
  ) {}

  // ---- Members (répertoire minimal pour peupler les listes déroulantes participant/assignee/
  // mention/reviewer — gouverné par ReadWorkspace, jamais par la permission d'administration
  // organisationnelle `organization:member:list`, réservée à OWNER/ORGANIZATION_ADMIN) ----

  @Get(":tenderId/workspace-members")
  @HttpCode(HttpStatus.OK)
  async listWorkspaceMembers(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listWorkspaceMembersUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }

  // ---- Participants ----

  @Get(":tenderId/participants")
  @HttpCode(HttpStatus.OK)
  async listParticipants(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listParticipantsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":tenderId/participants")
  @HttpCode(HttpStatus.CREATED)
  async addParticipant(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(AddTenderParticipantBodySchema)) body: AddTenderParticipantBody,
    @Req() request: RequestWithId,
  ) {
    return this.addParticipantUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Patch(":tenderId/participants/:participantId")
  @HttpCode(HttpStatus.OK)
  async changeParticipantRole(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("participantId", new ZodValidationPipe(IdParamSchema)) participantId: string,
    @Body(new ZodValidationPipe(ChangeTenderParticipantRoleBodySchema)) body: ChangeTenderParticipantRoleBody,
    @Req() request: RequestWithId,
  ) {
    return this.changeParticipantRoleUseCase.execute({ organizationId: membership.organizationId, tenderId, participantId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Delete(":tenderId/participants/:participantId")
  @HttpCode(HttpStatus.OK)
  async removeParticipant(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("participantId", new ZodValidationPipe(IdParamSchema)) participantId: string,
    @Req() request: RequestWithId,
  ) {
    return this.removeParticipantUseCase.execute({ organizationId: membership.organizationId, tenderId, participantId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  // ---- Tasks ----

  @Get(":tenderId/tasks")
  @HttpCode(HttpStatus.OK)
  async listTasks(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListTasksQuerySchema)) query: ListTasksQuery,
  ) {
    return this.listTasksUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...query,
      status: query.status ? [query.status] : undefined,
    });
  }

  @Post(":tenderId/tasks")
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateTaskBodySchema)) body: CreateTaskBody,
    @Req() request: RequestWithId,
  ) {
    return this.createTaskUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Get(":tenderId/tasks/:taskId")
  @HttpCode(HttpStatus.OK)
  async getTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
  ) {
    return this.getTaskUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role });
  }

  @Patch(":tenderId/tasks/:taskId")
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(UpdateTaskBodySchema)) body: UpdateTaskBody,
    @Req() request: RequestWithId,
  ) {
    return this.updateTaskUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role, ...body, lotId: body.lotId ?? undefined, requestId: request.id });
  }

  @Post(":tenderId/tasks/:taskId/assign")
  @HttpCode(HttpStatus.OK)
  async assignTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(AssignTaskBodySchema)) body: AssignTaskBody,
    @Req() request: RequestWithId,
  ) {
    return this.assignTaskUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Patch(":tenderId/tasks/:taskId/status")
  @HttpCode(HttpStatus.OK)
  async changeTaskStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
    @Body(new ZodValidationPipe(ChangeTaskStatusBodySchema)) body: ChangeTaskStatusBody,
    @Req() request: RequestWithId,
  ) {
    return this.changeTaskStatusUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Post(":tenderId/tasks/:taskId/complete")
  @HttpCode(HttpStatus.OK)
  async completeTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
    @Req() request: RequestWithId,
  ) {
    return this.changeTaskStatusUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role, status: TaskStatus.Done, requestId: request.id });
  }

  @Post(":tenderId/tasks/:taskId/reopen")
  @HttpCode(HttpStatus.OK)
  async reopenTask(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("taskId", new ZodValidationPipe(IdParamSchema)) taskId: string,
    @Req() request: RequestWithId,
  ) {
    return this.changeTaskStatusUseCase.execute({ organizationId: membership.organizationId, tenderId, taskId, actorId: actor.userId, actorRole: membership.role, status: TaskStatus.Todo, requestId: request.id });
  }

  // ---- Comments ----

  @Get(":tenderId/comments")
  @HttpCode(HttpStatus.OK)
  async listComments(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListCommentsQuerySchema)) query: ListCommentsQuery,
  ) {
    return this.listCommentsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...query });
  }

  @Post(":tenderId/comments")
  @HttpCode(HttpStatus.CREATED)
  async createComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateCommentBodySchema)) body: CreateCommentBody,
    @Req() request: RequestWithId,
  ) {
    return this.createCommentUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Patch(":tenderId/comments/:commentId")
  @HttpCode(HttpStatus.OK)
  async editComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("commentId", new ZodValidationPipe(IdParamSchema)) commentId: string,
    @Body(new ZodValidationPipe(EditCommentBodySchema)) body: EditCommentBody,
    @Req() request: RequestWithId,
  ) {
    return this.editCommentUseCase.execute({ organizationId: membership.organizationId, tenderId, commentId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Delete(":tenderId/comments/:commentId")
  @HttpCode(HttpStatus.OK)
  async deleteComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("commentId", new ZodValidationPipe(IdParamSchema)) commentId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteCommentUseCase.execute({ organizationId: membership.organizationId, tenderId, commentId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
    return { success: true };
  }

  // ---- Approvals ----

  @Get(":tenderId/approvals")
  @HttpCode(HttpStatus.OK)
  async listApprovals(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query("status") status: string | undefined,
  ) {
    return this.listApprovalsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, status });
  }

  @Post(":tenderId/approvals")
  @HttpCode(HttpStatus.CREATED)
  async requestApproval(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(RequestApprovalBodySchema)) body: RequestApprovalBody,
    @Req() request: RequestWithId,
  ) {
    return this.requestApprovalUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Post(":tenderId/approvals/:approvalId/approve")
  @HttpCode(HttpStatus.OK)
  async approveApproval(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("approvalId", new ZodValidationPipe(IdParamSchema)) approvalId: string,
    @Body(new ZodValidationPipe(ReviewApprovalBodySchema)) body: ReviewApprovalBody,
    @Req() request: RequestWithId,
  ) {
    return this.approveApprovalUseCase.execute({ organizationId: membership.organizationId, tenderId, approvalId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Post(":tenderId/approvals/:approvalId/request-changes")
  @HttpCode(HttpStatus.OK)
  async requestApprovalChanges(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("approvalId", new ZodValidationPipe(IdParamSchema)) approvalId: string,
    @Body(new ZodValidationPipe(ReviewApprovalBodySchema)) body: ReviewApprovalBody,
    @Req() request: RequestWithId,
  ) {
    return this.requestApprovalChangesUseCase.execute({ organizationId: membership.organizationId, tenderId, approvalId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  // ---- Activity ----

  @Get(":tenderId/activity")
  @HttpCode(HttpStatus.OK)
  async getActivity(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ActivityQuerySchema)) query: ActivityQuery,
  ) {
    return this.getTenderActivityUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...query });
  }
}
