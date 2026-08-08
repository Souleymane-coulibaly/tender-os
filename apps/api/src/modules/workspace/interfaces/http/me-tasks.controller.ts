import { Controller, Get, HttpCode, HttpStatus, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GetMyTasksUseCase } from "../../application/use-cases/get-my-tasks.use-case";
import { WorkspaceErrorFilter } from "./workspace-error.filter";
import { MyTasksQuerySchema, type MyTasksQuery } from "./schemas";

/** V2 Sprint 7 §35 — "Mes tâches", respecte strictement ClientAccess (voir `GetMyTasksUseCase`). */
@Controller("me")
@UseFilters(WorkspaceErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class MyTasksController {
  constructor(private readonly getMyTasksUseCase: GetMyTasksUseCase) {}

  @Get("tasks")
  @HttpCode(HttpStatus.OK)
  async listMyTasks(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Query(new ZodValidationPipe(MyTasksQuerySchema)) query: MyTasksQuery) {
    return this.getMyTasksUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...query,
      status: query.status ? [query.status] : undefined,
    });
  }
}
