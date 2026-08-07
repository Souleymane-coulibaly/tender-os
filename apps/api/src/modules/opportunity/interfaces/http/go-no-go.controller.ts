import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GenerateGoNoGoReportUseCase } from "../../application/use-cases/generate-go-no-go-report.use-case";
import { GetGoNoGoReportUseCase } from "../../application/use-cases/get-go-no-go-report.use-case";
import { ListGoNoGoReportsUseCase } from "../../application/use-cases/list-go-no-go-reports.use-case";
import { ListTenderGoNoGoDecisionsUseCase } from "../../application/use-cases/list-tender-go-no-go-decisions.use-case";
import { RecordTenderGoNoGoDecisionUseCase } from "../../application/use-cases/record-tender-go-no-go-decision.use-case";
import { OpportunityErrorFilter } from "./opportunity-error.filter";
import { IdParamSchema, RecordTenderGoNoGoDecisionBodySchema, type RecordTenderGoNoGoDecisionBody } from "./schemas";

/** Surface HTTP GO/NO-GO Niveau 2, Tender-scoped (mission Sprint 5 §31). `Tender.status` n'est
 *  JAMAIS modifié par ces routes (voir `RecordTenderGoNoGoDecisionUseCase`). */
@Controller("tenders/:tenderId/go-no-go")
@UseFilters(OpportunityErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class GoNoGoController {
  constructor(
    private readonly generateGoNoGoReportUseCase: GenerateGoNoGoReportUseCase,
    private readonly getGoNoGoReportUseCase: GetGoNoGoReportUseCase,
    private readonly listGoNoGoReportsUseCase: ListGoNoGoReportsUseCase,
    private readonly recordTenderGoNoGoDecisionUseCase: RecordTenderGoNoGoDecisionUseCase,
    private readonly listTenderGoNoGoDecisionsUseCase: ListTenderGoNoGoDecisionsUseCase,
  ) {}

  @Post("report")
  @HttpCode(HttpStatus.OK)
  async generateReport(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    return this.generateGoNoGoReportUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Get("report")
  async getLatestReport(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getGoNoGoReportUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get("reports")
  async listReports(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listGoNoGoReportsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post("decisions")
  async recordDecision(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(RecordTenderGoNoGoDecisionBodySchema)) body: RecordTenderGoNoGoDecisionBody,
    @Req() request: RequestWithId,
  ) {
    return this.recordTenderGoNoGoDecisionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Get("decisions")
  async listDecisions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listTenderGoNoGoDecisionsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }
}
