import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddDeliverableCommentUseCase } from "../../application/use-cases/add-deliverable-comment.use-case";
import { ApproveDeliverableUseCase } from "../../application/use-cases/approve-deliverable.use-case";
import { CreateChecklistPieceEntryUseCase, ListChecklistPieceEntriesUseCase, UpdateChecklistPieceEntryUseCase } from "../../application/use-cases/checklist-piece.use-cases";
import { CreateComplianceMatrixEntryUseCase, ListComplianceMatrixEntriesUseCase, UpdateComplianceMatrixEntryUseCase, ValidateComplianceMatrixEntryUseCase } from "../../application/use-cases/compliance-matrix.use-cases";
import { CreateDeliverableAnnexUseCase, ListDeliverableAnnexesUseCase, UpdateDeliverableAnnexUseCase } from "../../application/use-cases/deliverable-annex.use-cases";
import { EnsureTenderDeliverablesUseCase } from "../../application/use-cases/ensure-tender-deliverables.use-case";
import { GetDeliverableUseCase } from "../../application/use-cases/get-deliverable.use-case";
import { ListDeliverablesUseCase } from "../../application/use-cases/list-deliverables.use-case";
import { PreviewDeliverableUseCase } from "../../application/use-cases/preview-deliverable.use-case";
import {
  GetDeliverableCostReportUseCase,
  GetDeliverableSignatureDocumentsUseCase,
  GetDeliverableSubmissionPackageUseCase,
  GetDeliverableValidationReportUseCase,
} from "../../application/use-cases/read-only-deliverable-views.use-cases";
import { ResolveDeliverableCommentUseCase } from "../../application/use-cases/resolve-deliverable-comment.use-case";
import { SelectCostReportEstimateUseCase } from "../../application/use-cases/select-cost-report-estimate.use-case";
import { DeliverableErrorFilter } from "./deliverable-error.filter";
import {
  AddDeliverableCommentBodySchema,
  CreateChecklistPieceEntryBodySchema,
  CreateComplianceMatrixEntryBodySchema,
  CreateDeliverableAnnexBodySchema,
  IdParamSchema,
  SelectCostReportEstimateBodySchema,
  UpdateChecklistPieceEntryBodySchema,
  UpdateComplianceMatrixEntryBodySchema,
  UpdateDeliverableAnnexBodySchema,
  type AddDeliverableCommentBody,
  type CreateChecklistPieceEntryBody,
  type CreateComplianceMatrixEntryBody,
  type CreateDeliverableAnnexBody,
  type SelectCostReportEstimateBody,
  type UpdateChecklistPieceEntryBody,
  type UpdateComplianceMatrixEntryBody,
  type UpdateDeliverableAnnexBody,
} from "./schemas";

/**
 * Mission Sprint 8A.1 §16/§20 — Espace Livrables : liste/détail, aperçu (réutilise le pipeline
 * Export existant), commentaires, et les 4 livrables en overlay léger/lecture seule (mission §14).
 * Le Mémoire technique/la Synthèse exécutive (structure/sections/révisions) vivent dans
 * `DeliverableSectionsController`.
 */
@Controller()
@UseFilters(DeliverableErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DeliverablesController {
  constructor(
    private readonly ensureTenderDeliverablesUseCase: EnsureTenderDeliverablesUseCase,
    private readonly listDeliverablesUseCase: ListDeliverablesUseCase,
    private readonly getDeliverableUseCase: GetDeliverableUseCase,
    private readonly previewDeliverableUseCase: PreviewDeliverableUseCase,
    private readonly approveDeliverableUseCase: ApproveDeliverableUseCase,
    private readonly selectCostReportEstimateUseCase: SelectCostReportEstimateUseCase,
    private readonly getValidationReportUseCase: GetDeliverableValidationReportUseCase,
    private readonly getCostReportUseCase: GetDeliverableCostReportUseCase,
    private readonly getSignatureDocumentsUseCase: GetDeliverableSignatureDocumentsUseCase,
    private readonly getSubmissionPackageUseCase: GetDeliverableSubmissionPackageUseCase,
    private readonly addCommentUseCase: AddDeliverableCommentUseCase,
    private readonly resolveCommentUseCase: ResolveDeliverableCommentUseCase,
    private readonly createComplianceMatrixEntryUseCase: CreateComplianceMatrixEntryUseCase,
    private readonly updateComplianceMatrixEntryUseCase: UpdateComplianceMatrixEntryUseCase,
    private readonly validateComplianceMatrixEntryUseCase: ValidateComplianceMatrixEntryUseCase,
    private readonly listComplianceMatrixEntriesUseCase: ListComplianceMatrixEntriesUseCase,
    private readonly createChecklistPieceEntryUseCase: CreateChecklistPieceEntryUseCase,
    private readonly updateChecklistPieceEntryUseCase: UpdateChecklistPieceEntryUseCase,
    private readonly listChecklistPieceEntriesUseCase: ListChecklistPieceEntriesUseCase,
    private readonly createDeliverableAnnexUseCase: CreateDeliverableAnnexUseCase,
    private readonly listDeliverableAnnexesUseCase: ListDeliverableAnnexesUseCase,
    private readonly updateDeliverableAnnexUseCase: UpdateDeliverableAnnexUseCase,
  ) {}

  @Get("tenders/:tenderId/deliverables")
  async list(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listDeliverablesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/deliverables/ensure")
  @HttpCode(HttpStatus.OK)
  async ensure(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    const deliverables = await this.ensureTenderDeliverablesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
    return deliverables.map((d) => ({ id: d.id, type: d.type, status: d.status }));
  }

  @Get("deliverables/:id")
  async get(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.getDeliverableUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/preview")
  @HttpCode(HttpStatus.CREATED)
  async preview(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.previewDeliverableUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/approve")
  @HttpCode(HttpStatus.OK)
  async approve(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.approveDeliverableUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Get("deliverables/:id/validation-report")
  async validationReport(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.getValidationReportUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Get("deliverables/:id/cost-report")
  async costReport(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    const report = await this.getCostReportUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
    return report ?? null;
  }

  @Post("deliverables/:id/cost-report/select-estimate")
  @HttpCode(HttpStatus.OK)
  async selectCostReportEstimate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Body(new ZodValidationPipe(SelectCostReportEstimateBodySchema)) body: SelectCostReportEstimateBody,
  ) {
    return this.selectCostReportEstimateUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, ...body });
  }

  @Get("deliverables/:id/signature-documents")
  async signatureDocuments(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.getSignatureDocumentsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Get("deliverables/:id/submission-package")
  async submissionPackage(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.getSubmissionPackageUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/comments")
  @HttpCode(HttpStatus.CREATED)
  async addComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Body(new ZodValidationPipe(AddDeliverableCommentBodySchema)) body: AddDeliverableCommentBody,
  ) {
    return this.addCommentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, ...body });
  }

  @Post("deliverables/:id/comments/:commentId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveComment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Param("commentId", new ZodValidationPipe(IdParamSchema)) commentId: string,
  ) {
    return this.resolveCommentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, commentId });
  }

  @Get("deliverables/:id/compliance-matrix")
  async listComplianceMatrix(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.listComplianceMatrixEntriesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/compliance-matrix")
  @HttpCode(HttpStatus.CREATED)
  async createComplianceMatrixEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Body(new ZodValidationPipe(CreateComplianceMatrixEntryBodySchema)) body: CreateComplianceMatrixEntryBody,
  ) {
    return this.createComplianceMatrixEntryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, ...body });
  }

  @Patch("deliverables/:id/compliance-matrix/:entryId")
  async updateComplianceMatrixEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Body(new ZodValidationPipe(UpdateComplianceMatrixEntryBodySchema)) body: UpdateComplianceMatrixEntryBody,
  ) {
    return this.updateComplianceMatrixEntryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, entryId, ...body });
  }

  @Post("deliverables/:id/compliance-matrix/:entryId/validate")
  @HttpCode(HttpStatus.OK)
  async validateComplianceMatrixEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
  ) {
    return this.validateComplianceMatrixEntryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, entryId });
  }

  @Get("deliverables/:id/checklist")
  async listChecklist(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.listChecklistPieceEntriesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/checklist")
  @HttpCode(HttpStatus.CREATED)
  async createChecklistPieceEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Body(new ZodValidationPipe(CreateChecklistPieceEntryBodySchema)) body: CreateChecklistPieceEntryBody,
  ) {
    return this.createChecklistPieceEntryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, ...body });
  }

  @Patch("deliverables/:id/checklist/:entryId")
  async updateChecklistPieceEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Body(new ZodValidationPipe(UpdateChecklistPieceEntryBodySchema)) body: UpdateChecklistPieceEntryBody,
  ) {
    return this.updateChecklistPieceEntryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, entryId, ...body });
  }

  @Get("deliverables/:id/annexes")
  async listAnnexes(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string) {
    return this.listDeliverableAnnexesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId });
  }

  @Post("deliverables/:id/annexes")
  @HttpCode(HttpStatus.CREATED)
  async createAnnex(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Body(new ZodValidationPipe(CreateDeliverableAnnexBodySchema)) body: CreateDeliverableAnnexBody,
  ) {
    return this.createDeliverableAnnexUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, ...body });
  }

  @Patch("deliverables/:id/annexes/:annexId")
  async updateAnnex(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableId: string,
    @Param("annexId", new ZodValidationPipe(IdParamSchema)) annexId: string,
    @Body(new ZodValidationPipe(UpdateDeliverableAnnexBodySchema)) body: UpdateDeliverableAnnexBody,
  ) {
    return this.updateDeliverableAnnexUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliverableId, annexId, ...body });
  }
}
