import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ArchiveOpportunityUseCase } from "../../application/use-cases/archive-opportunity.use-case";
import { ChangeOpportunityStatusUseCase } from "../../application/use-cases/change-opportunity-status.use-case";
import { ComputeOpportunityQuickScoreUseCase } from "../../application/use-cases/compute-opportunity-quick-score.use-case";
import { CreateOpportunityUseCase } from "../../application/use-cases/create-opportunity.use-case";
import { GetOpportunityUseCase } from "../../application/use-cases/get-opportunity.use-case";
import { GetOpportunityQuickScoreUseCase } from "../../application/use-cases/get-opportunity-quick-score.use-case";
import { ListOpportunitiesUseCase } from "../../application/use-cases/list-opportunities.use-case";
import { ListOpportunityGoNoGoDecisionsUseCase } from "../../application/use-cases/list-opportunity-go-no-go-decisions.use-case";
import { ListOpportunityQuickScoresUseCase } from "../../application/use-cases/list-opportunity-quick-scores.use-case";
import { PromoteOpportunityToTenderUseCase } from "../../application/use-cases/promote-opportunity-to-tender.use-case";
import { RecordOpportunityGoNoGoDecisionUseCase } from "../../application/use-cases/record-opportunity-go-no-go-decision.use-case";
import { RestoreOpportunityUseCase } from "../../application/use-cases/restore-opportunity.use-case";
import { UpdateOpportunityUseCase } from "../../application/use-cases/update-opportunity.use-case";
import { OpportunityErrorFilter } from "./opportunity-error.filter";
import {
  ChangeOpportunityStatusBodySchema,
  CreateOpportunityBodySchema,
  IdParamSchema,
  ListOpportunitiesQuerySchema,
  PromoteOpportunityBodySchema,
  RecordOpportunityGoNoGoDecisionBodySchema,
  UpdateOpportunityBodySchema,
  type ChangeOpportunityStatusBody,
  type CreateOpportunityBody,
  type ListOpportunitiesQuery,
  type PromoteOpportunityBody,
  type RecordOpportunityGoNoGoDecisionBody,
  type UpdateOpportunityBody,
} from "./schemas";

const DEFAULT_LIST_LIMIT = 20;

/**
 * Surface HTTP Opportunity (mission Sprint 5 §31, routes indicatives adaptées aux conventions
 * réelles du dépôt). GO/GO_CONDITIONAL/NO_GO/PROMOTED/ARCHIVED ne sont JAMAIS atteignables via
 * `PATCH /opportunities/:id/status` (voir `ChangeOpportunityStatusUseCase`) — décisions et
 * promotion ont chacune leur propre route dédiée, protégée par sa propre permission.
 */
@Controller("opportunities")
@UseFilters(OpportunityErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class OpportunitiesController {
  constructor(
    private readonly createOpportunityUseCase: CreateOpportunityUseCase,
    private readonly getOpportunityUseCase: GetOpportunityUseCase,
    private readonly listOpportunitiesUseCase: ListOpportunitiesUseCase,
    private readonly updateOpportunityUseCase: UpdateOpportunityUseCase,
    private readonly changeOpportunityStatusUseCase: ChangeOpportunityStatusUseCase,
    private readonly archiveOpportunityUseCase: ArchiveOpportunityUseCase,
    private readonly restoreOpportunityUseCase: RestoreOpportunityUseCase,
    private readonly computeOpportunityQuickScoreUseCase: ComputeOpportunityQuickScoreUseCase,
    private readonly getOpportunityQuickScoreUseCase: GetOpportunityQuickScoreUseCase,
    private readonly listOpportunityQuickScoresUseCase: ListOpportunityQuickScoresUseCase,
    private readonly recordOpportunityGoNoGoDecisionUseCase: RecordOpportunityGoNoGoDecisionUseCase,
    private readonly listOpportunityGoNoGoDecisionsUseCase: ListOpportunityGoNoGoDecisionsUseCase,
    private readonly promoteOpportunityToTenderUseCase: PromoteOpportunityToTenderUseCase,
  ) {}

  @Post()
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateOpportunityBodySchema)) body: CreateOpportunityBody,
    @Req() request: RequestWithId,
  ) {
    return this.createOpportunityUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Get()
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListOpportunitiesQuerySchema)) query: ListOpportunitiesQuery,
  ) {
    const page = await this.listOpportunitiesUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      cursor: query.cursor,
      limit: query.limit ?? DEFAULT_LIST_LIMIT,
      status: query.status,
      clientAccountId: query.clientAccountId,
      sort: query.sort,
      sortDirection: query.sortDirection,
    });
    // Même forme de pagination que `presentPage` (module `tenders`) — jamais une seconde
    // convention `{items, nextCursor}` exposée telle quelle au frontend.
    return { items: page.items, pageInfo: { hasNextPage: page.nextCursor !== null, nextCursor: page.nextCursor } };
  }

  @Get(":id")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.getOpportunityUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Patch(":id")
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateOpportunityBodySchema)) body: UpdateOpportunityBody,
    @Req() request: RequestWithId,
  ) {
    return this.updateOpportunityUseCase.execute({
      organizationId: membership.organizationId,
      opportunityId: id,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Patch(":id/status")
  async changeStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(ChangeOpportunityStatusBodySchema)) body: ChangeOpportunityStatusBody,
    @Req() request: RequestWithId,
  ) {
    return this.changeOpportunityStatusUseCase.execute({
      organizationId: membership.organizationId,
      opportunityId: id,
      actorId: actor.userId,
      actorRole: membership.role,
      nextStatus: body.status,
      requestId: request.id,
    });
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.archiveOpportunityUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.restoreOpportunityUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Post(":id/quick-score")
  @HttpCode(HttpStatus.OK)
  async computeQuickScore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ) {
    return this.computeOpportunityQuickScoreUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Get(":id/quick-score")
  async getLatestQuickScore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.getOpportunityQuickScoreUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":id/quick-scores")
  async listQuickScores(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.listOpportunityQuickScoresUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/go-no-go-decisions")
  async recordDecision(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(RecordOpportunityGoNoGoDecisionBodySchema)) body: RecordOpportunityGoNoGoDecisionBody,
    @Req() request: RequestWithId,
  ) {
    return this.recordOpportunityGoNoGoDecisionUseCase.execute({
      organizationId: membership.organizationId,
      opportunityId: id,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Get(":id/go-no-go-decisions")
  async listDecisions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.listOpportunityGoNoGoDecisionsUseCase.execute({ organizationId: membership.organizationId, opportunityId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/promote")
  @HttpCode(HttpStatus.OK)
  async promote(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(PromoteOpportunityBodySchema)) body: PromoteOpportunityBody,
    @Req() request: RequestWithId,
  ) {
    return this.promoteOpportunityToTenderUseCase.execute({
      organizationId: membership.organizationId,
      opportunityId: id,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }
}
