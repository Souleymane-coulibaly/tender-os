import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CompareRevisionsUseCase } from "../../application/use-cases/compare-revisions.use-case";
import { CreateManualRevisionUseCase } from "../../application/use-cases/create-manual-revision.use-case";
import { CreateRevisionFromGenerationUseCase } from "../../application/use-cases/create-revision-from-generation.use-case";
import { DecideRevisionReviewUseCase } from "../../application/use-cases/decide-revision-review.use-case";
import { GenerateDeliverableSectionUseCase } from "../../application/use-cases/generate-deliverable-section.use-case";
import { ListSectionRevisionsUseCase } from "../../application/use-cases/list-section-revisions.use-case";
import { RestoreRevisionUseCase } from "../../application/use-cases/restore-revision.use-case";
import { SaveRevisionDraftUseCase } from "../../application/use-cases/save-revision-draft.use-case";
import { SelectRevisionForExportUseCase } from "../../application/use-cases/select-revision-for-export.use-case";
import { SubmitRevisionForReviewUseCase, WithdrawRevisionFromReviewUseCase } from "../../application/use-cases/submit-revision-for-review.use-case";
import { UpdateDeliverableSectionUseCase } from "../../application/use-cases/update-deliverable-section.use-case";
import type { GenerationTaskType } from "../../../generation";
import { DeliverableErrorFilter } from "./deliverable-error.filter";
import {
  CompareRevisionsQuerySchema,
  CreateManualRevisionBodySchema,
  CreateRevisionFromGenerationBodySchema,
  DecideRevisionReviewBodySchema,
  GenerateSectionBodySchema,
  IdParamSchema,
  RestoreRevisionBodySchema,
  SaveRevisionDraftBodySchema,
  SelectRevisionForExportBodySchema,
  UpdateDeliverableSectionBodySchema,
  type CompareRevisionsQuery,
  type CreateManualRevisionBody,
  type CreateRevisionFromGenerationBody,
  type DecideRevisionReviewBody,
  type GenerateSectionBody,
  type RestoreRevisionBody,
  type SaveRevisionDraftBody,
  type SelectRevisionForExportBody,
  type UpdateDeliverableSectionBody,
} from "./schemas";

/**
 * Mission Sprint 8A.1 §7/§9/§10/§11/§12/§13 — Mémoire technique/Synthèse exécutive : génération IA,
 * édition humaine, versions, comparaison, revue, sélection pour l'export. Toutes les routes sont
 * imbriquées sous une section précise (`deliverableSectionId`) — chaque use case revérifie
 * lui-même que la révision appartient bien à cette section (mission §19, jamais une confiance
 * aveugle dans l'URL).
 */
@Controller("deliverable-sections/:sectionId")
@UseFilters(DeliverableErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DeliverableSectionsController {
  constructor(
    private readonly generateDeliverableSectionUseCase: GenerateDeliverableSectionUseCase,
    private readonly createManualRevisionUseCase: CreateManualRevisionUseCase,
    private readonly createRevisionFromGenerationUseCase: CreateRevisionFromGenerationUseCase,
    private readonly listSectionRevisionsUseCase: ListSectionRevisionsUseCase,
    private readonly compareRevisionsUseCase: CompareRevisionsUseCase,
    private readonly saveRevisionDraftUseCase: SaveRevisionDraftUseCase,
    private readonly submitRevisionForReviewUseCase: SubmitRevisionForReviewUseCase,
    private readonly withdrawRevisionFromReviewUseCase: WithdrawRevisionFromReviewUseCase,
    private readonly decideRevisionReviewUseCase: DecideRevisionReviewUseCase,
    private readonly selectRevisionForExportUseCase: SelectRevisionForExportUseCase,
    private readonly restoreRevisionUseCase: RestoreRevisionUseCase,
    private readonly updateDeliverableSectionUseCase: UpdateDeliverableSectionUseCase,
  ) {}

  @Patch()
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(UpdateDeliverableSectionBodySchema)) body: UpdateDeliverableSectionBody,
  ) {
    return this.updateDeliverableSectionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      deliverableSectionId: sectionId,
      ...body,
    });
  }

  @Post("generate")
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(GenerateSectionBodySchema)) body: GenerateSectionBody,
  ) {
    return this.generateDeliverableSectionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      deliverableSectionId: sectionId,
      taskType: body.taskType as GenerationTaskType | undefined,
    });
  }

  @Get("revisions")
  async listRevisions(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string) {
    return this.listSectionRevisionsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId });
  }

  @Post("revisions")
  @HttpCode(HttpStatus.CREATED)
  async createManualRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(CreateManualRevisionBodySchema)) body: CreateManualRevisionBody,
  ) {
    return this.createManualRevisionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, ...body });
  }

  @Post("revisions/from-generation")
  @HttpCode(HttpStatus.CREATED)
  async createRevisionFromGeneration(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(CreateRevisionFromGenerationBodySchema)) body: CreateRevisionFromGenerationBody,
  ) {
    return this.createRevisionFromGenerationUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, ...body });
  }

  @Get("compare")
  async compare(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Query(new ZodValidationPipe(CompareRevisionsQuerySchema)) query: CompareRevisionsQuery,
  ) {
    return this.compareRevisionsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, ...query });
  }

  @Patch("revisions/:revisionId")
  async saveDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Param("revisionId", new ZodValidationPipe(IdParamSchema)) revisionId: string,
    @Body(new ZodValidationPipe(SaveRevisionDraftBodySchema)) body: SaveRevisionDraftBody,
  ) {
    return this.saveRevisionDraftUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      deliverableSectionId: sectionId,
      revisionId,
      ...body,
    });
  }

  @Post("revisions/:revisionId/submit-review")
  @HttpCode(HttpStatus.OK)
  async submitForReview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Param("revisionId", new ZodValidationPipe(IdParamSchema)) revisionId: string,
  ) {
    return this.submitRevisionForReviewUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, revisionId });
  }

  @Post("revisions/:revisionId/withdraw-review")
  @HttpCode(HttpStatus.OK)
  async withdrawFromReview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Param("revisionId", new ZodValidationPipe(IdParamSchema)) revisionId: string,
  ) {
    return this.withdrawRevisionFromReviewUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, revisionId });
  }

  @Post("revisions/:revisionId/review")
  @HttpCode(HttpStatus.OK)
  async decideReview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Param("revisionId", new ZodValidationPipe(IdParamSchema)) revisionId: string,
    @Body(new ZodValidationPipe(DecideRevisionReviewBodySchema)) body: DecideRevisionReviewBody,
  ) {
    return this.decideRevisionReviewUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      deliverableSectionId: sectionId,
      revisionId,
      ...body,
    });
  }

  @Post("revisions/:revisionId/select-for-export")
  @HttpCode(HttpStatus.OK)
  async selectForExport(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Param("revisionId", new ZodValidationPipe(IdParamSchema)) revisionId: string,
    @Body(new ZodValidationPipe(SelectRevisionForExportBodySchema)) body: SelectRevisionForExportBody,
  ) {
    await this.selectRevisionForExportUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      deliverableSectionId: sectionId,
      revisionId,
      ...body,
    });
    return { selected: true };
  }

  @Post("revisions/restore")
  @HttpCode(HttpStatus.CREATED)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(RestoreRevisionBodySchema)) body: RestoreRevisionBody,
  ) {
    return this.restoreRevisionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableSectionId: sectionId, ...body });
  }
}
