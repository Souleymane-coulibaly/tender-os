import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ArchiveClientAccountUseCase } from "../../application/use-cases/archive-client-account.use-case";
import { AssignUserToClientUseCase } from "../../application/use-cases/assign-user-to-client.use-case";
import { CreateClientAccountUseCase } from "../../application/use-cases/create-client-account.use-case";
import { DeleteClientAccountUseCase } from "../../application/use-cases/delete-client-account.use-case";
import { GetClientAccountUseCase } from "../../application/use-cases/get-client-account.use-case";
import { ListClientAccountsUseCase } from "../../application/use-cases/list-client-accounts.use-case";
import { ListClientAssignmentsUseCase } from "../../application/use-cases/list-client-assignments.use-case";
import { RemoveClientAssignmentUseCase } from "../../application/use-cases/remove-client-assignment.use-case";
import { RestoreClientAccountUseCase } from "../../application/use-cases/restore-client-account.use-case";
import { UpdateClientAccountUseCase } from "../../application/use-cases/update-client-account.use-case";
import { UpdateClientAssignmentUseCase } from "../../application/use-cases/update-client-assignment.use-case";
import { ClientPortfolioErrorFilter } from "./client-portfolio-error.filter";
import { presentClientAccount, presentClientAssignment, presentPage } from "./presenters";
import {
  AssignUserToClientBodySchema,
  CreateClientAccountBodySchema,
  IdParamSchema,
  ListClientAccountsQuerySchema,
  UpdateClientAccountBodySchema,
  UpdateClientAssignmentBodySchema,
  type AssignUserToClientBody,
  type CreateClientAccountBody,
  type ListClientAccountsQuery,
  type UpdateClientAccountBody,
  type UpdateClientAssignmentBody,
} from "./schemas";

/**
 * Contrôleur Client Portfolio (mission Sprint 5.1) — un seul contrôleur pour les clients et leurs
 * affectations (même motif que Knowledge Base pour ses sous-ressources) : reste mince, aucune règle
 * métier, aucun accès Prisma direct, toute la logique (y compris la policy d'accès centralisée) vit
 * dans les use cases.
 */
@Controller("clients")
@UseFilters(ClientPortfolioErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ClientPortfolioController {
  constructor(
    private readonly createClientAccountUseCase: CreateClientAccountUseCase,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly listClientAccountsUseCase: ListClientAccountsUseCase,
    private readonly updateClientAccountUseCase: UpdateClientAccountUseCase,
    private readonly archiveClientAccountUseCase: ArchiveClientAccountUseCase,
    private readonly restoreClientAccountUseCase: RestoreClientAccountUseCase,
    private readonly deleteClientAccountUseCase: DeleteClientAccountUseCase,
    private readonly assignUserToClientUseCase: AssignUserToClientUseCase,
    private readonly updateClientAssignmentUseCase: UpdateClientAssignmentUseCase,
    private readonly removeClientAssignmentUseCase: RemoveClientAssignmentUseCase,
    private readonly listClientAssignmentsUseCase: ListClientAssignmentsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateClientAccountBodySchema)) body: CreateClientAccountBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentClientAccount(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListClientAccountsQuerySchema)) query: ListClientAccountsQuery,
  ) {
    const result = await this.listClientAccountsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      includeArchived: query.includeArchived ?? false,
      status: query.status,
      nameSearch: query.nameSearch,
      cursor: query.cursor,
      limit: query.limit,
    });
    return { ...presentPage(result.items.map(presentClientAccount), result.nextCursor), total: result.total };
  }

  @Get(":clientId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
  ) {
    const result = await this.getClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return presentClientAccount(result);
  }

  @Patch(":clientId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(UpdateClientAccountBodySchema)) body: UpdateClientAccountBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentClientAccount(result);
  }

  @Post(":clientId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.archiveClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentClientAccount(result);
  }

  @Post(":clientId/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.restoreClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentClientAccount(result);
  }

  @Delete(":clientId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteClientAccountUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }

  // ---- Affectations ----

  @Get(":clientId/assignments")
  @HttpCode(HttpStatus.OK)
  async listAssignments(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
  ) {
    const results = await this.listClientAssignmentsUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return results.map(presentClientAssignment);
  }

  @Post(":clientId/assignments")
  @HttpCode(HttpStatus.CREATED)
  async assign(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(AssignUserToClientBodySchema)) body: AssignUserToClientBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.assignUserToClientUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      actorId: actor.userId,
      actorRole: membership.role,
      targetUserId: body.userId,
      role: body.role,
      requestId: request.id,
    });
    return presentClientAssignment(result);
  }

  @Patch(":clientId/assignments/:assignmentId")
  @HttpCode(HttpStatus.OK)
  async updateAssignment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("assignmentId", new ZodValidationPipe(IdParamSchema)) assignmentId: string,
    @Body(new ZodValidationPipe(UpdateClientAssignmentBodySchema)) body: UpdateClientAssignmentBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateClientAssignmentUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      assignmentId,
      actorId: actor.userId,
      actorRole: membership.role,
      role: body.role,
      requestId: request.id,
    });
    return presentClientAssignment(result);
  }

  @Delete(":clientId/assignments/:assignmentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAssignment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("assignmentId", new ZodValidationPipe(IdParamSchema)) assignmentId: string,
    @Req() request: RequestWithId,
  ) {
    await this.removeClientAssignmentUseCase.execute({
      organizationId: membership.organizationId,
      clientAccountId: clientId,
      assignmentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }
}
