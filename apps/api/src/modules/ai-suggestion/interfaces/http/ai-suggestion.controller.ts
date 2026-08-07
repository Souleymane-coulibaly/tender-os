import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AcceptAiSuggestionUseCase } from "../../application/use-cases/accept-ai-suggestion.use-case";
import { GetAiSuggestionUseCase } from "../../application/use-cases/get-ai-suggestion.use-case";
import { ListAiSuggestionsUseCase } from "../../application/use-cases/list-ai-suggestions.use-case";
import { ModifyAiSuggestionUseCase } from "../../application/use-cases/modify-ai-suggestion.use-case";
import { RejectAiSuggestionUseCase } from "../../application/use-cases/reject-ai-suggestion.use-case";
import { AiSuggestionErrorFilter } from "./ai-suggestion-error.filter";
import {
  IdParamSchema,
  ListAiSuggestionsQuerySchema,
  ModifyAiSuggestionBodySchema,
  RejectAiSuggestionBodySchema,
  type ListAiSuggestionsQuery,
  type ModifyAiSuggestionBody,
  type RejectAiSuggestionBody,
} from "./schemas";

/**
 * Mission Sprint 1 §3 — surface HTTP volontairement limitée à la lecture et à la décision
 * humaine (accepter/modifier/rejeter). La création reste in-process uniquement
 * (`CreateAiSuggestionUseCase`, appelée par un futur module producteur) : aucun schéma métier
 * ne peut être sérialisé côté client, et aucun mapper métier n'existe encore ce sprint.
 */
@Controller("ai-suggestions")
@UseFilters(AiSuggestionErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AiSuggestionController {
  constructor(
    private readonly listAiSuggestionsUseCase: ListAiSuggestionsUseCase,
    private readonly getAiSuggestionUseCase: GetAiSuggestionUseCase,
    private readonly acceptAiSuggestionUseCase: AcceptAiSuggestionUseCase,
    private readonly modifyAiSuggestionUseCase: ModifyAiSuggestionUseCase,
    private readonly rejectAiSuggestionUseCase: RejectAiSuggestionUseCase,
  ) {}

  @Get()
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListAiSuggestionsQuerySchema)) query: ListAiSuggestionsQuery,
  ) {
    return this.listAiSuggestionsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      entityType: query.entityType,
      entityId: query.entityId,
      parentTenderId: query.parentTenderId,
      status: query.status,
    });
  }

  @Get(":id")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.getAiSuggestionUseCase.execute({ id, organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/accept")
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
  ) {
    return this.acceptAiSuggestionUseCase.execute({ id, organizationId: membership.organizationId, actorUserId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/modify")
  @HttpCode(HttpStatus.OK)
  async modify(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(ModifyAiSuggestionBodySchema)) body: ModifyAiSuggestionBody,
  ) {
    return this.modifyAiSuggestionUseCase.execute({
      id,
      organizationId: membership.organizationId,
      actorUserId: actor.userId,
      actorRole: membership.role,
      editedValue: body.editedValue,
      reason: body.reason,
    });
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(RejectAiSuggestionBodySchema)) body: RejectAiSuggestionBody,
  ) {
    return this.rejectAiSuggestionUseCase.execute({
      id,
      organizationId: membership.organizationId,
      actorUserId: actor.userId,
      actorRole: membership.role,
      reason: body.reason,
    });
  }
}
