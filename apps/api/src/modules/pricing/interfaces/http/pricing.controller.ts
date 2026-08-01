import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ArchivePricingEstimateUseCase } from "../../application/use-cases/archive-pricing-estimate.use-case";
import { CompareEstimatedAndActualCostUseCase } from "../../application/use-cases/compare-estimated-and-actual-cost.use-case";
import { CreatePricingEstimateUseCase } from "../../application/use-cases/create-pricing-estimate.use-case";
import { GetClientCostSummaryUseCase } from "../../application/use-cases/get-client-cost-summary.use-case";
import { GetOrganizationCostSummaryUseCase } from "../../application/use-cases/get-organization-cost-summary.use-case";
import { GetPricingEstimateUseCase } from "../../application/use-cases/get-pricing-estimate.use-case";
import { GetTenderCostSummaryUseCase } from "../../application/use-cases/get-tender-cost-summary.use-case";
import { ListPricingEstimatesUseCase } from "../../application/use-cases/list-pricing-estimates.use-case";
import { PreviewGenerationCostUseCase } from "../../application/use-cases/preview-generation-cost.use-case";
import { RecalculatePricingEstimateUseCase } from "../../application/use-cases/recalculate-pricing-estimate.use-case";
import { PricingErrorFilter } from "./pricing-error.filter";
import { presentPricingEstimate } from "./presenters";
import {
  CreatePricingEstimateBodySchema,
  DateRangeQuerySchema,
  GetPricingEstimateQuerySchema,
  IdParamSchema,
  ListPricingEstimatesQuerySchema,
  PreviewGenerationCostBodySchema,
  RecalculatePricingEstimateBodySchema,
  type CreatePricingEstimateBody,
  type DateRangeQuery,
  type GetPricingEstimateQuery,
  type ListPricingEstimatesQuery,
  type PreviewGenerationCostBody,
  type RecalculatePricingEstimateBody,
} from "./schemas";

/** Routes Pricing — jamais de calcul de coût, de règle d'arrondi, de choix de devise, d'agrégation
 *  ni de logique tenant/client ici : tout délégué aux use cases (mission §"Interfaces"). */
@Controller()
@UseFilters(PricingErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class PricingController {
  constructor(
    private readonly previewGenerationCostUseCase: PreviewGenerationCostUseCase,
    private readonly createPricingEstimateUseCase: CreatePricingEstimateUseCase,
    private readonly recalculatePricingEstimateUseCase: RecalculatePricingEstimateUseCase,
    private readonly getPricingEstimateUseCase: GetPricingEstimateUseCase,
    private readonly listPricingEstimatesUseCase: ListPricingEstimatesUseCase,
    private readonly archivePricingEstimateUseCase: ArchivePricingEstimateUseCase,
    private readonly getTenderCostSummaryUseCase: GetTenderCostSummaryUseCase,
    private readonly getClientCostSummaryUseCase: GetClientCostSummaryUseCase,
    private readonly getOrganizationCostSummaryUseCase: GetOrganizationCostSummaryUseCase,
    private readonly compareEstimatedAndActualCostUseCase: CompareEstimatedAndActualCostUseCase,
  ) {}

  @Post("tenders/:tenderId/pricing/preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(PreviewGenerationCostBodySchema)) body: PreviewGenerationCostBody,
  ) {
    return this.previewGenerationCostUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      taskType: body.taskType,
      estimatedGenerationsCount: body.estimatedGenerationsCount,
      estimatedInputTokensPerGeneration: body.estimatedInputTokensPerGeneration,
      estimatedOutputTokensPerGeneration: body.estimatedOutputTokensPerGeneration,
    });
  }

  @Post("tenders/:tenderId/pricing/estimates")
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreatePricingEstimateBodySchema)) body: CreatePricingEstimateBody,
  ) {
    const result = await this.createPricingEstimateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      taskType: body.taskType,
      assumptions: body.assumptions,
    });
    return presentPricingEstimate(result);
  }

  @Get("tenders/:tenderId/pricing/estimates")
  async listForTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListPricingEstimatesQuerySchema)) query: ListPricingEstimatesQuery,
  ) {
    const result = await this.listPricingEstimatesUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      includeArchived: query.includeArchived,
      limit: query.limit,
      offset: query.offset,
    });
    return { items: result.items.map(presentPricingEstimate), total: result.total };
  }

  @Get("tenders/:tenderId/pricing/summary")
  async tenderSummary(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getTenderCostSummaryUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
    });
  }

  @Get("clients/:clientAccountId/pricing/summary")
  async clientSummary(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientAccountId", new ZodValidationPipe(IdParamSchema)) clientAccountId: string,
    @Query(new ZodValidationPipe(DateRangeQuerySchema)) query: DateRangeQuery,
  ) {
    return this.getClientCostSummaryUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      clientAccountId,
      from: query.from,
      to: query.to,
    });
  }

  @Get("pricing/organization/summary")
  async organizationSummary(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(DateRangeQuerySchema)) query: DateRangeQuery,
  ) {
    return this.getOrganizationCostSummaryUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      from: query.from,
      to: query.to,
    });
  }

  @Get("pricing/estimates/:estimateId")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("estimateId", new ZodValidationPipe(IdParamSchema)) estimateId: string,
    @Query(new ZodValidationPipe(GetPricingEstimateQuerySchema)) query: GetPricingEstimateQuery,
  ) {
    const result = await this.getPricingEstimateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      estimateId,
      version: query.version,
    });
    return presentPricingEstimate(result);
  }

  @Post("pricing/estimates/:estimateId/recalculate")
  @HttpCode(HttpStatus.OK)
  async recalculate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("estimateId", new ZodValidationPipe(IdParamSchema)) estimateId: string,
    @Body(new ZodValidationPipe(RecalculatePricingEstimateBodySchema)) body: RecalculatePricingEstimateBody,
  ) {
    const result = await this.recalculatePricingEstimateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      estimateId,
      taskType: body.taskType,
      assumptions: body.assumptions,
      reason: body.reason,
    });
    return presentPricingEstimate(result);
  }

  @Post("pricing/estimates/:estimateId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("estimateId", new ZodValidationPipe(IdParamSchema)) estimateId: string,
  ) {
    const result = await this.archivePricingEstimateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      estimateId,
    });
    return presentPricingEstimate(result);
  }

  @Get("pricing/estimates/:estimateId/comparison")
  async comparison(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("estimateId", new ZodValidationPipe(IdParamSchema)) estimateId: string,
  ) {
    return this.compareEstimatedAndActualCostUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      estimateId,
    });
  }
}
