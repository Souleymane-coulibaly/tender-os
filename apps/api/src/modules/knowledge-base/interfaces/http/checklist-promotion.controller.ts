import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { PromoteChecklistItemToKnowledgeUseCase } from "../../application/use-cases/promote-checklist-item-to-knowledge.use-case";
import { KnowledgeErrorFilter } from "./knowledge-error.filter";
import { presentKnowledgeEntry } from "./presenters";
import { IdParamSchema, PromoteChecklistItemToKnowledgeBodySchema, type PromoteChecklistItemToKnowledgeBody } from "./schemas";

/**
 * V2 Sprint 8 §19 — route rattachée à `tenders/:tenderId/checklist/:itemId/...` (même convention
 * que `TendersController`) mais déclarée dans un contrôleur DÉDIÉ du module Knowledge Base, jamais
 * dans `TendersController` lui-même : Knowledge Base importe déjà `TendersModule` (pour charger le
 * `ChecklistItem` source, anti-IDOR) ; faire l'inverse (Tenders important Knowledge Base) créerait un
 * cycle de modules NestJS. NestJS route sur le chemin déclaré, pas sur le nom du contrôleur — un
 * second contrôleur sur le même préfixe `tenders` est un motif déjà établi (`TenderLotsController`,
 * `BuyersController`, tous distincts de `TendersController`).
 */
@Controller("tenders")
@UseFilters(KnowledgeErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ChecklistPromotionController {
  constructor(private readonly promoteChecklistItemToKnowledgeUseCase: PromoteChecklistItemToKnowledgeUseCase) {}

  @Post(":tenderId/checklist/:itemId/promote-to-knowledge")
  @HttpCode(HttpStatus.CREATED)
  async promoteToKnowledge(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(PromoteChecklistItemToKnowledgeBodySchema)) body: PromoteChecklistItemToKnowledgeBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.promoteChecklistItemToKnowledgeUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      itemId,
      actorId: actor.userId,
      actorRole: membership.role,
      title: body.title,
      description: body.description,
      category: body.category,
      metadata: body.metadata,
      tags: body.tags,
      clientAccountId: body.clientAccountId,
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }
}
