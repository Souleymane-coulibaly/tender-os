import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ApproveModelRecommendationUseCase } from "../../application/use-cases/approve-model-recommendation.use-case";
import { GenerateModelRecommendationUseCase } from "../../application/use-cases/generate-model-recommendation.use-case";
import { GetModelRecommendationUseCase } from "../../application/use-cases/get-model-recommendation.use-case";
import { ListModelRecommendationsUseCase } from "../../application/use-cases/list-model-recommendations.use-case";
import { RejectModelRecommendationUseCase } from "../../application/use-cases/reject-model-recommendation.use-case";
import { AiBenchmarkErrorFilter } from "./ai-benchmark-error.filter";
import { presentModelRecommendation } from "./presenters";
import {
  GenerateModelRecommendationBodySchema,
  IdParamSchema,
  type GenerateModelRecommendationBody,
} from "./schemas";

/** Contrôleur des recommandations (Sprint 5.2 §"Recommandations") — reste mince, aucune règle
 *  d'agrégation/génération ici (dans les use cases/services applicatifs). */
@Controller("ai-benchmark/recommendations")
@UseFilters(AiBenchmarkErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ModelRecommendationsController {
  constructor(
    private readonly generateUseCase: GenerateModelRecommendationUseCase,
    private readonly approveUseCase: ApproveModelRecommendationUseCase,
    private readonly rejectUseCase: RejectModelRecommendationUseCase,
    private readonly listUseCase: ListModelRecommendationsUseCase,
    private readonly getUseCase: GetModelRecommendationUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(GenerateModelRecommendationBodySchema)) body: GenerateModelRecommendationBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.generateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      runId: body.runId,
      requestId: request.id,
    });
    return presentModelRecommendation(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    const results = await this.listUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
    return results.map(presentModelRecommendation);
  }

  @Get(":recommendationId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("recommendationId", new ZodValidationPipe(IdParamSchema)) recommendationId: string,
  ) {
    const result = await this.getUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      recommendationId,
    });
    return presentModelRecommendation(result);
  }

  @Post(":recommendationId/approve")
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("recommendationId", new ZodValidationPipe(IdParamSchema)) recommendationId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.approveUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      recommendationId,
      requestId: request.id,
    });
    return presentModelRecommendation(result);
  }

  @Post(":recommendationId/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("recommendationId", new ZodValidationPipe(IdParamSchema)) recommendationId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.rejectUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      recommendationId,
      requestId: request.id,
    });
    return presentModelRecommendation(result);
  }
}
