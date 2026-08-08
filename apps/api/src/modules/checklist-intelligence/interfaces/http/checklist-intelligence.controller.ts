import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GetTenderUseCase } from "../../../tenders";
import { AttachChecklistItemDocumentUseCase, DetachChecklistItemDocumentUseCase } from "../../application/use-cases/attach-checklist-item-document.use-case";
import { FindChecklistItemDocumentMatchesUseCase } from "../../application/use-cases/find-checklist-item-document-matches.use-case";
import { ReconcileChecklistWithNewAnalysisUseCase } from "../../application/use-cases/reconcile-checklist-with-new-analysis.use-case";
import { ChecklistIntelligenceErrorFilter } from "./checklist-intelligence-error.filter";
import { AttachChecklistItemDocumentBodySchema, IdParamSchema, type AttachChecklistItemDocumentBody } from "./schemas";

/**
 * V2 Sprint 6 §16-18/§22 — routes de rapprochement documentaire et de réconciliation nouvelle
 * analyse. Contrôleur SÉPARÉ de `TendersController` (module distinct, `checklist-intelligence`) :
 * ces actions ont besoin de lire `documents`/`company-profile`/`subcontractors`/`analysis`, qui
 * importent déjà `TendersModule` — un import inverse depuis `tenders` créerait un cycle (voir le
 * commentaire de `checklist-intelligence.module.ts`). Même préfixe `tenders` que
 * `TendersController` : routes distinctes, aucune collision.
 */
@Controller("tenders")
@UseFilters(ChecklistIntelligenceErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ChecklistIntelligenceController {
  constructor(
    private readonly getTenderUseCase: GetTenderUseCase,
    private readonly findDocumentMatchesUseCase: FindChecklistItemDocumentMatchesUseCase,
    private readonly attachDocumentUseCase: AttachChecklistItemDocumentUseCase,
    private readonly detachDocumentUseCase: DetachChecklistItemDocumentUseCase,
    private readonly reconcileUseCase: ReconcileChecklistWithNewAnalysisUseCase,
  ) {}

  @Post(":tenderId/checklist/:itemId/document-matches")
  @HttpCode(HttpStatus.OK)
  async findDocumentMatches(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
  ) {
    const tender = await this.getTenderUseCase.execute({ organizationId: membership.organizationId, tenderId, actorRole: membership.role, actorId: actor.userId });
    return this.findDocumentMatchesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      itemId,
      actorId: actor.userId,
      actorRole: membership.role,
      clientAccountId: tender.clientAccountId,
    });
  }

  @Post(":tenderId/checklist/:itemId/attach-document")
  @HttpCode(HttpStatus.OK)
  async attachDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(AttachChecklistItemDocumentBodySchema)) body: AttachChecklistItemDocumentBody,
    @Req() request: RequestWithId,
  ) {
    return this.attachDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      itemId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Delete(":tenderId/checklist/:itemId/document")
  @HttpCode(HttpStatus.OK)
  async detachDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Req() request: RequestWithId,
  ) {
    return this.detachDocumentUseCase.execute({ organizationId: membership.organizationId, tenderId, itemId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Post(":tenderId/checklist/reconcile")
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    return this.reconcileUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }
}
