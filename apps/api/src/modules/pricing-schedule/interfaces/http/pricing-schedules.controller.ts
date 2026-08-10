import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toPricingScheduleFinalFileSummary, toPricingScheduleLineSummary, toPricingScheduleSummary, toPricingScheduleVersionSummary } from "../../application/dtos";
import { ExtractPricingScheduleVersionUseCase } from "../../application/use-cases/extract-pricing-schedule-version.use-case";
import { GeneratePricingScheduleFinalFileUseCase } from "../../application/use-cases/generate-pricing-schedule-final-file.use-case";
import { GetBpuDqeCoherenceUseCase } from "../../application/use-cases/get-bpu-dqe-coherence.use-case";
import { GetPricingScheduleControlsUseCase } from "../../application/use-cases/get-pricing-schedule-controls.use-case";
import { GetPricingScheduleUseCase } from "../../application/use-cases/get-pricing-schedule.use-case";
import { SetPricingScheduleLineCommentUseCase } from "../../application/use-cases/set-pricing-schedule-line-comment.use-case";
import { SetPricingScheduleLineCostBreakdownUseCase } from "../../application/use-cases/set-pricing-schedule-line-cost-breakdown.use-case";
import { SetPricingScheduleLineUnitPriceUseCase } from "../../application/use-cases/set-pricing-schedule-line-unit-price.use-case";
import { ValidatePricingScheduleVersionUseCase } from "../../application/use-cases/validate-pricing-schedule-version.use-case";
import { PricingScheduleErrorFilter } from "./pricing-schedule-error.filter";
import {
  ExtractPricingScheduleVersionBodySchema,
  IdParamSchema,
  SetPricingScheduleLineCommentBodySchema,
  SetPricingScheduleLineCostBreakdownBodySchema,
  SetPricingScheduleLineUnitPriceBodySchema,
  ValidatePricingScheduleVersionBodySchema,
  type ExtractPricingScheduleVersionBody,
  type SetPricingScheduleLineCommentBody,
  type SetPricingScheduleLineCostBreakdownBody,
  type SetPricingScheduleLineUnitPriceBody,
  type ValidatePricingScheduleVersionBody,
} from "./schemas";

@Controller("pricing-schedules")
@UseFilters(PricingScheduleErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class PricingSchedulesController {
  constructor(
    private readonly getPricingScheduleUseCase: GetPricingScheduleUseCase,
    private readonly extractPricingScheduleVersionUseCase: ExtractPricingScheduleVersionUseCase,
    private readonly setUnitPriceUseCase: SetPricingScheduleLineUnitPriceUseCase,
    private readonly setCostBreakdownUseCase: SetPricingScheduleLineCostBreakdownUseCase,
    private readonly setCommentUseCase: SetPricingScheduleLineCommentUseCase,
    private readonly getControlsUseCase: GetPricingScheduleControlsUseCase,
    private readonly getBpuDqeCoherenceUseCase: GetBpuDqeCoherenceUseCase,
    private readonly validateVersionUseCase: ValidatePricingScheduleVersionUseCase,
    private readonly generateFinalFileUseCase: GeneratePricingScheduleFinalFileUseCase,
  ) {}

  @Get(":pricingScheduleId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Query("versionId") versionId?: string,
  ) {
    const result = await this.getPricingScheduleUseCase.execute({
      organizationId: membership.organizationId,
      pricingScheduleId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleVersionId: versionId && IdParamSchema.safeParse(versionId).success ? versionId : undefined,
    });
    return {
      schedule: toPricingScheduleSummary(result.schedule),
      versions: result.versions.map(toPricingScheduleVersionSummary),
      lines: result.lines.map(toPricingScheduleLineSummary),
    };
  }

  @Post(":pricingScheduleId/extract")
  @HttpCode(HttpStatus.CREATED)
  async extract(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Body(new ZodValidationPipe(ExtractPricingScheduleVersionBodySchema)) body: ExtractPricingScheduleVersionBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.extractPricingScheduleVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      sourceDocumentVersionId: body.sourceDocumentVersionId,
      requestId: request.id,
    });
    return { version: toPricingScheduleVersionSummary(result.version), lines: result.lines.map(toPricingScheduleLineSummary) };
  }

  @Patch(":pricingScheduleId/lines/:lineId/price")
  @HttpCode(HttpStatus.OK)
  async setUnitPrice(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("lineId", new ZodValidationPipe(IdParamSchema)) lineId: string,
    @Body(new ZodValidationPipe(SetPricingScheduleLineUnitPriceBodySchema)) body: SetPricingScheduleLineUnitPriceBody,
    @Req() request: RequestWithId,
  ) {
    const line = await this.setUnitPriceUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      pricingScheduleLineId: lineId,
      unitPrice: body.unitPrice,
      requestId: request.id,
    });
    return toPricingScheduleLineSummary(line);
  }

  @Patch(":pricingScheduleId/lines/:lineId/cost-breakdown")
  @HttpCode(HttpStatus.OK)
  async setCostBreakdown(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("lineId", new ZodValidationPipe(IdParamSchema)) lineId: string,
    @Body(new ZodValidationPipe(SetPricingScheduleLineCostBreakdownBodySchema)) body: SetPricingScheduleLineCostBreakdownBody,
    @Req() request: RequestWithId,
  ) {
    const line = await this.setCostBreakdownUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      pricingScheduleLineId: lineId,
      costBreakdown: body.costBreakdown,
      requestId: request.id,
    });
    return toPricingScheduleLineSummary(line);
  }

  @Patch(":pricingScheduleId/lines/:lineId/comment")
  @HttpCode(HttpStatus.OK)
  async setComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("lineId", new ZodValidationPipe(IdParamSchema)) lineId: string,
    @Body(new ZodValidationPipe(SetPricingScheduleLineCommentBodySchema)) body: SetPricingScheduleLineCommentBody,
    @Req() request: RequestWithId,
  ) {
    const line = await this.setCommentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      pricingScheduleLineId: lineId,
      candidateComment: body.candidateComment,
      requestId: request.id,
    });
    return toPricingScheduleLineSummary(line);
  }

  @Get(":pricingScheduleId/versions/:versionId/controls")
  @HttpCode(HttpStatus.OK)
  async getControls(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.getControlsUseCase.execute({ organizationId: membership.organizationId, pricingScheduleId, pricingScheduleVersionId: versionId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":pricingScheduleId/versions/:versionId/coherence")
  @HttpCode(HttpStatus.OK)
  async getCoherence(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.getBpuDqeCoherenceUseCase.execute({ organizationId: membership.organizationId, pricingScheduleId, pricingScheduleVersionId: versionId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":pricingScheduleId/versions/:versionId/validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Body(new ZodValidationPipe(ValidatePricingScheduleVersionBodySchema)) body: ValidatePricingScheduleVersionBody,
    @Req() request: RequestWithId,
  ) {
    const version = await this.validateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      pricingScheduleVersionId: versionId,
      overrideJustification: body.overrideJustification,
      requestId: request.id,
    });
    return toPricingScheduleVersionSummary(version);
  }

  /** Action EXPLICITE et SÉPARÉE de la validation (mission, décision utilisateur : "Validate → puis
   *  → Generate"), jamais déclenchée automatiquement par `validate`. */
  @Post(":pricingScheduleId/versions/:versionId/generate")
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("pricingScheduleId", new ZodValidationPipe(IdParamSchema)) pricingScheduleId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.generateFinalFileUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      pricingScheduleId,
      pricingScheduleVersionId: versionId,
      requestId: request.id,
    });
    return toPricingScheduleFinalFileSummary(result.finalFile);
  }
}
