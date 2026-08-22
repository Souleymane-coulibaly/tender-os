import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toSavedSearchMatchSummary, toSavedSearchSummary } from "../../application/dtos";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../../application/ports/saved-search-match.repository";
import { CreateSavedSearchUseCase } from "../../application/use-cases/create-saved-search.use-case";
import { DeleteSavedSearchUseCase } from "../../application/use-cases/delete-saved-search.use-case";
import { GetSavedSearchUseCase } from "../../application/use-cases/get-saved-search.use-case";
import { ListSavedSearchesUseCase } from "../../application/use-cases/list-saved-searches.use-case";
import { ListSavedSearchMatchesUseCase } from "../../application/use-cases/list-saved-search-matches.use-case";
import { PromoteExternalTenderToOpportunityUseCase } from "../../application/use-cases/promote-external-tender-to-opportunity.use-case";
import { SetMatchStatusUseCase } from "../../application/use-cases/set-match-status.use-case";
import { SetSavedSearchStatusUseCase } from "../../application/use-cases/set-saved-search-status.use-case";
import { UpdateSavedSearchUseCase } from "../../application/use-cases/update-saved-search.use-case";
import { MarketWatchErrorFilter } from "./market-watch-error.filter";
import {
  CreateSavedSearchBodySchema,
  IdParamSchema,
  ListMatchesQuerySchema,
  PromoteExternalTenderBodySchema,
  SetMatchStatusBodySchema,
  SetSavedSearchStatusBodySchema,
  toCriteriaCommand,
  UpdateSavedSearchBodySchema,
  type CreateSavedSearchBody,
  type ListMatchesQuery,
  type PromoteExternalTenderBody,
  type SetMatchStatusBody,
  type SetSavedSearchStatusBody,
  type UpdateSavedSearchBody,
} from "./schemas";

/** Mission §15/§16/§17 — veilles STRICTEMENT personnelles : `ownerUserId` = acteur courant partout,
 *  jamais un paramètre. */
@Controller("market-watch/saved-searches")
@UseFilters(MarketWatchErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SavedSearchesController {
  constructor(
    private readonly createSavedSearchUseCase: CreateSavedSearchUseCase,
    private readonly updateSavedSearchUseCase: UpdateSavedSearchUseCase,
    private readonly setSavedSearchStatusUseCase: SetSavedSearchStatusUseCase,
    private readonly deleteSavedSearchUseCase: DeleteSavedSearchUseCase,
    private readonly listSavedSearchesUseCase: ListSavedSearchesUseCase,
    private readonly getSavedSearchUseCase: GetSavedSearchUseCase,
    private readonly listSavedSearchMatchesUseCase: ListSavedSearchMatchesUseCase,
    private readonly setMatchStatusUseCase: SetMatchStatusUseCase,
    private readonly promoteExternalTenderToOpportunityUseCase: PromoteExternalTenderToOpportunityUseCase,
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly savedSearchMatchRepository: SavedSearchMatchRepository,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext) {
    const searches = await this.listSavedSearchesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role });
    // Mission §31/§39 — UNE seule requête groupée pour le badge "NEW" de toutes les veilles de la
    // page, jamais N requêtes (une par veille).
    const newCounts = await this.savedSearchMatchRepository.countByStatus({ organizationId: membership.organizationId, savedSearchIds: searches.map((s) => s.id), status: "NEW" });
    return searches.map((search) => toSavedSearchSummary(search, newCounts[search.id] ?? 0));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateSavedSearchBodySchema)) body: CreateSavedSearchBody,
    @Req() request: RequestWithId,
  ) {
    const search = await this.createSavedSearchUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      criteria: toCriteriaCommand(body.criteria),
      requestId: request.id,
    });
    return toSavedSearchSummary(search);
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) savedSearchId: string) {
    const search = await this.getSavedSearchUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, savedSearchId });
    return toSavedSearchSummary(search);
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) savedSearchId: string,
    @Body(new ZodValidationPipe(UpdateSavedSearchBodySchema)) body: UpdateSavedSearchBody,
    @Req() request: RequestWithId,
  ) {
    const search = await this.updateSavedSearchUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      savedSearchId,
      ...body,
      criteria: toCriteriaCommand(body.criteria),
      requestId: request.id,
    });
    return toSavedSearchSummary(search);
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) savedSearchId: string,
    @Body(new ZodValidationPipe(SetSavedSearchStatusBodySchema)) body: SetSavedSearchStatusBody,
    @Req() request: RequestWithId,
  ) {
    await this.setSavedSearchStatusUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, savedSearchId, enabled: body.enabled, requestId: request.id });
    return { enabled: body.enabled };
  }

  @Post(":id/delete")
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) savedSearchId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteSavedSearchUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, savedSearchId, requestId: request.id });
    return { deleted: true };
  }

  @Get(":id/matches")
  @HttpCode(HttpStatus.OK)
  async listMatches(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) savedSearchId: string,
    @Query(new ZodValidationPipe(ListMatchesQuerySchema)) query: ListMatchesQuery,
  ) {
    const page = await this.listSavedSearchMatchesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, savedSearchId, cursor: query.cursor, limit: query.limit });
    return { items: page.items.map(({ match, tender }) => toSavedSearchMatchSummary(match, tender)), nextCursor: page.nextCursor };
  }

  @Post("matches/:matchId/status")
  @HttpCode(HttpStatus.OK)
  async setMatchStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("matchId", new ZodValidationPipe(IdParamSchema)) matchId: string,
    @Body(new ZodValidationPipe(SetMatchStatusBodySchema)) body: SetMatchStatusBody,
  ) {
    await this.setMatchStatusUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, matchId, status: body.status });
    return { status: body.status };
  }

  /** Mission §53/§55 — "Ajouter à mes opportunités", jamais automatique. */
  @Post("external-tenders/:externalTenderId/promote")
  @HttpCode(HttpStatus.CREATED)
  async promote(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("externalTenderId", new ZodValidationPipe(IdParamSchema)) externalTenderId: string,
    @Body(new ZodValidationPipe(PromoteExternalTenderBodySchema)) body: PromoteExternalTenderBody,
    @Req() request: RequestWithId,
  ) {
    return this.promoteExternalTenderToOpportunityUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      externalTenderId,
      clientAccountId: body.clientAccountId,
      confirmDuplicate: body.confirmDuplicate,
      requestId: request.id,
    });
  }
}
