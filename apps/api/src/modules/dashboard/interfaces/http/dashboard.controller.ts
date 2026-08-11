import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { GetDashboardOverviewUseCase } from "../../application/use-cases/get-dashboard-overview.use-case";
import { DashboardQuerySchema, type DashboardQuery } from "./schemas";

@Controller("dashboard")
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DashboardController {
  constructor(private readonly getDashboardOverviewUseCase: GetDashboardOverviewUseCase) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getOverview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(DashboardQuerySchema)) query: DashboardQuery,
  ) {
    return this.getDashboardOverviewUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      clientAccountId: query.clientId,
      periodDays: query.periodDays,
    });
  }
}
