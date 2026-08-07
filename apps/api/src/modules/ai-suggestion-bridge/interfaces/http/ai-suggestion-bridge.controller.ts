import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ListAiSuggestionsUseCase } from "../../../ai-suggestion";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ApplyAiSuggestionUseCase } from "../../application/use-cases/apply-ai-suggestion.use-case";
import { AiSuggestionBridgeErrorFilter } from "./ai-suggestion-bridge-error.filter";
import {
  ApplyAiSuggestionBodySchema,
  IdParamSchema,
  ListTenderSuggestionsQuerySchema,
  type ApplyAiSuggestionBody,
  type ListTenderSuggestionsQuery,
} from "./schemas";

/**
 * V2 Sprint 4 — surface HTTP du bridge. `POST /ai-suggestions/:id/apply` est le SEUL chemin qui
 * écrit réellement une donnée métier à partir d'une suggestion IA (les routes génériques
 * `/ai-suggestions/:id/accept|modify|reject` du module `ai-suggestion` ne font que transitionner
 * le statut de la suggestion elle-même, jamais la cible). `GET /tenders/:tenderId/analysis/suggestions`
 * réutilise `ListAiSuggestionsUseCase` filtré par `parentTenderId`, jamais une seconde requête.
 */
@Controller()
@UseFilters(AiSuggestionBridgeErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AiSuggestionBridgeController {
  constructor(
    private readonly applyAiSuggestionUseCase: ApplyAiSuggestionUseCase,
    private readonly listAiSuggestionsUseCase: ListAiSuggestionsUseCase,
  ) {}

  @Post("ai-suggestions/:id/apply")
  @HttpCode(HttpStatus.OK)
  async apply(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(ApplyAiSuggestionBodySchema)) body: ApplyAiSuggestionBody,
  ) {
    return this.applyAiSuggestionUseCase.execute({
      id,
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      editedValue: body.editedValue,
      conflictResolution: body.conflictResolution,
      reason: body.reason,
    });
  }

  @Get("tenders/:tenderId/analysis/suggestions")
  async listForTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListTenderSuggestionsQuerySchema)) query: ListTenderSuggestionsQuery,
  ) {
    return this.listAiSuggestionsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      parentTenderId: tenderId,
      status: query.status,
    });
  }
}
