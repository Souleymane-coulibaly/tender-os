import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toPricingScheduleSummary } from "../../application/dtos";
import { CreatePricingScheduleUseCase } from "../../application/use-cases/create-pricing-schedule.use-case";
import { ListPricingSchedulesUseCase } from "../../application/use-cases/list-pricing-schedules.use-case";
import { PricingScheduleErrorFilter } from "./pricing-schedule-error.filter";
import { CreatePricingScheduleBodySchema, IdParamSchema, type CreatePricingScheduleBody } from "./schemas";

/** Mission route conceptuelle `POST /tenders/:tenderId/pricing-schedules` — même convention de
 *  préfixe que `TenderTechnicalMemosController`/`ChatController` : `/tenders/:id/...`. */
@Controller("tenders")
@UseFilters(PricingScheduleErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderPricingSchedulesController {
  constructor(
    private readonly createPricingScheduleUseCase: CreatePricingScheduleUseCase,
    private readonly listPricingSchedulesUseCase: ListPricingSchedulesUseCase,
  ) {}

  @Get(":tenderId/pricing-schedules")
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query("lotId") lotId?: string,
  ) {
    const schedules = await this.listPricingSchedulesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      lotId: lotId && IdParamSchema.safeParse(lotId).success ? lotId : undefined,
    });
    return schedules.map(toPricingScheduleSummary);
  }

  @Post(":tenderId/pricing-schedules")
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreatePricingScheduleBodySchema)) body: CreatePricingScheduleBody,
    @Req() request: RequestWithId,
  ) {
    const schedule = await this.createPricingScheduleUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      lotId: body.lotId,
      sourceDocumentId: body.sourceDocumentId,
      financialDocumentTypeOverride: body.financialDocumentTypeOverride,
      requestId: request.id,
    });
    return toPricingScheduleSummary(schedule);
  }
}
