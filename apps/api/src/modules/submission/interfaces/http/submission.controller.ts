import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddSubmissionProofUseCase } from "../../application/use-cases/add-submission-proof.use-case";
import { CancelTenderSubmissionUseCase } from "../../application/use-cases/cancel-tender-submission.use-case";
import { ConfirmSubmissionReceiptUseCase } from "../../application/use-cases/confirm-submission-receipt.use-case";
import { GetTenderSubmissionCapabilitiesUseCase } from "../../application/use-cases/get-tender-submission-capabilities.use-case";
import { GetTenderSubmissionReadinessUseCase } from "../../application/use-cases/get-tender-submission-readiness.use-case";
import { GetTenderSubmissionUseCase } from "../../application/use-cases/get-tender-submission.use-case";
import { ListTenderSubmissionsUseCase } from "../../application/use-cases/list-tender-submissions.use-case";
import { RecordSubmissionRejectionUseCase } from "../../application/use-cases/record-submission-rejection.use-case";
import { RecordTenderSubmissionUseCase } from "../../application/use-cases/record-tender-submission.use-case";
import { ReplaceTenderSubmissionUseCase } from "../../application/use-cases/replace-tender-submission.use-case";
import { StartTenderSubmissionUseCase } from "../../application/use-cases/start-tender-submission.use-case";
import { WithdrawTenderSubmissionUseCase } from "../../application/use-cases/withdraw-tender-submission.use-case";
import { SubmissionErrorFilter } from "./submission-error.filter";
import {
  AddSubmissionProofBodySchema,
  CancelTenderSubmissionBodySchema,
  ConfirmSubmissionReceiptBodySchema,
  IdParamSchema,
  RecordSubmissionRejectionBodySchema,
  RecordTenderSubmissionBodySchema,
  ReplaceTenderSubmissionBodySchema,
  StartTenderSubmissionBodySchema,
  WithdrawTenderSubmissionBodySchema,
  type AddSubmissionProofBody,
  type CancelTenderSubmissionBody,
  type ConfirmSubmissionReceiptBody,
  type RecordSubmissionRejectionBody,
  type RecordTenderSubmissionBody,
  type ReplaceTenderSubmissionBody,
  type StartTenderSubmissionBody,
  type WithdrawTenderSubmissionBody,
} from "./schemas";

/**
 * Sprint 9 — dépôt manuel assisté et suivi de soumission. Convention de routage : les requêtes
 * SANS ressource encore identifiée (readiness/capabilities/liste/démarrage/enregistrement)
 * restent nichées sous `tenders/:tenderId/...` ; les actions sur une soumission EXISTANTE
 * (`submissions/:id/...`) sont des ressources plates dont le `tenderId` est dérivé de la
 * ressource chargée — même convention que `administrative-documents/:id` (mission §21/§30
 * "jamais faire confiance à un organizationId/tenderId fourni par le frontend seul").
 */
@Controller()
@UseFilters(SubmissionErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SubmissionController {
  constructor(
    private readonly getReadinessUseCase: GetTenderSubmissionReadinessUseCase,
    private readonly getCapabilitiesUseCase: GetTenderSubmissionCapabilitiesUseCase,
    private readonly listSubmissionsUseCase: ListTenderSubmissionsUseCase,
    private readonly getSubmissionUseCase: GetTenderSubmissionUseCase,
    private readonly startSubmissionUseCase: StartTenderSubmissionUseCase,
    private readonly recordSubmissionUseCase: RecordTenderSubmissionUseCase,
    private readonly addProofUseCase: AddSubmissionProofUseCase,
    private readonly confirmReceiptUseCase: ConfirmSubmissionReceiptUseCase,
    private readonly replaceSubmissionUseCase: ReplaceTenderSubmissionUseCase,
    private readonly withdrawSubmissionUseCase: WithdrawTenderSubmissionUseCase,
    private readonly cancelSubmissionUseCase: CancelTenderSubmissionUseCase,
    private readonly recordRejectionUseCase: RecordSubmissionRejectionUseCase,
  ) {}

  @Get("tenders/:tenderId/submission-readiness")
  async getReadiness(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getReadinessUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/submission-capabilities")
  async getCapabilities(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getCapabilitiesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/submissions")
  async list(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listSubmissionsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/submissions/start")
  @HttpCode(HttpStatus.CREATED)
  async start(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(StartTenderSubmissionBodySchema)) body: StartTenderSubmissionBody,
  ) {
    return this.startSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Post("tenders/:tenderId/submissions")
  @HttpCode(HttpStatus.CREATED)
  async record(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(RecordTenderSubmissionBodySchema)) body: RecordTenderSubmissionBody,
  ) {
    return this.recordSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Get("submissions/:id")
  async getOne(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string) {
    return this.getSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId });
  }

  @Post("submissions/:id/proofs")
  @HttpCode(HttpStatus.CREATED)
  async addProof(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(AddSubmissionProofBodySchema)) body: AddSubmissionProofBody,
  ) {
    return this.addProofUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }

  @Post("submissions/:id/confirm-receipt")
  @HttpCode(HttpStatus.OK)
  async confirmReceipt(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(ConfirmSubmissionReceiptBodySchema)) body: ConfirmSubmissionReceiptBody,
  ) {
    return this.confirmReceiptUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }

  @Post("submissions/:id/replace")
  @HttpCode(HttpStatus.CREATED)
  async replace(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(ReplaceTenderSubmissionBodySchema)) body: ReplaceTenderSubmissionBody,
  ) {
    return this.replaceSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }

  @Post("submissions/:id/withdraw")
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(WithdrawTenderSubmissionBodySchema)) body: WithdrawTenderSubmissionBody,
  ) {
    return this.withdrawSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }

  @Post("submissions/:id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(CancelTenderSubmissionBodySchema)) body: CancelTenderSubmissionBody,
  ) {
    return this.cancelSubmissionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }

  @Post("submissions/:id/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) submissionId: string,
    @Body(new ZodValidationPipe(RecordSubmissionRejectionBodySchema)) body: RecordSubmissionRejectionBody,
  ) {
    return this.recordRejectionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, submissionId, ...body });
  }
}
