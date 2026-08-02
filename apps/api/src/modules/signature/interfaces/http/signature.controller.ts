import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res, StreamableFile, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ConfirmSignatureRequirementUseCase } from "../../application/use-cases/confirm-signature-requirement.use-case";
import { DetectSignatureRequirementUseCase } from "../../application/use-cases/detect-signature-requirement.use-case";
import { DownloadSignatureArtifactUseCase } from "../../application/use-cases/download-signature-artifact.use-case";
import { GetSignatureTransactionUseCase } from "../../application/use-cases/get-signature-transaction.use-case";
import { ImportSignedDocumentUseCase } from "../../application/use-cases/import-signed-document.use-case";
import { ListSignatoriesUseCase } from "../../application/use-cases/list-signatories.use-case";
import { ListSignatureRequirementsUseCase } from "../../application/use-cases/list-signature-requirements.use-case";
import { ListSignatureTransactionsUseCase } from "../../application/use-cases/list-signature-transactions.use-case";
import { PrepareSignatureRequestUseCase } from "../../application/use-cases/prepare-signature-request.use-case";
import { RegisterSignatoryUseCase } from "../../application/use-cases/register-signatory.use-case";
import { RejectSignatureRequirementUseCase } from "../../application/use-cases/reject-signature-requirement.use-case";
import { RetrieveSignedArtifactsUseCase } from "../../application/use-cases/retrieve-signed-artifacts.use-case";
import { StartSignatureTransactionUseCase } from "../../application/use-cases/start-signature-transaction.use-case";
import { SyncSignatureTransactionStatusUseCase } from "../../application/use-cases/sync-signature-transaction-status.use-case";
import { VerifySignatoryAuthorityUseCase } from "../../application/use-cases/verify-signatory-authority.use-case";
import { VerifySignedDocumentIntegrityUseCase } from "../../application/use-cases/verify-signed-document-integrity.use-case";
import { SignatureErrorFilter } from "./signature-error.filter";
import {
  ConfirmRejectRequirementBodySchema,
  DetectSignatureRequirementBodySchema,
  IdParamSchema,
  PrepareSignatureRequestBodySchema,
  RegisterSignatoryBodySchema,
  StartSignatureTransactionBodySchema,
  VerifySignatoryBodySchema,
  type ConfirmRejectRequirementBody,
  type DetectSignatureRequirementBody,
  type PrepareSignatureRequestBody,
  type RegisterSignatoryBody,
  type StartSignatureTransactionBody,
  type VerifySignatoryBody,
} from "./schemas";

const MULTER_HARD_CEILING_BYTES = 25 * 1024 * 1024;

@Controller()
@UseFilters(SignatureErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SignatureController {
  constructor(
    private readonly detectSignatureRequirementUseCase: DetectSignatureRequirementUseCase,
    private readonly listSignatureRequirementsUseCase: ListSignatureRequirementsUseCase,
    private readonly confirmSignatureRequirementUseCase: ConfirmSignatureRequirementUseCase,
    private readonly rejectSignatureRequirementUseCase: RejectSignatureRequirementUseCase,
    private readonly registerSignatoryUseCase: RegisterSignatoryUseCase,
    private readonly listSignatoriesUseCase: ListSignatoriesUseCase,
    private readonly listSignatureTransactionsUseCase: ListSignatureTransactionsUseCase,
    private readonly verifySignatoryAuthorityUseCase: VerifySignatoryAuthorityUseCase,
    private readonly prepareSignatureRequestUseCase: PrepareSignatureRequestUseCase,
    private readonly startSignatureTransactionUseCase: StartSignatureTransactionUseCase,
    private readonly syncSignatureTransactionStatusUseCase: SyncSignatureTransactionStatusUseCase,
    private readonly getSignatureTransactionUseCase: GetSignatureTransactionUseCase,
    private readonly retrieveSignedArtifactsUseCase: RetrieveSignedArtifactsUseCase,
    private readonly importSignedDocumentUseCase: ImportSignedDocumentUseCase,
    private readonly verifySignedDocumentIntegrityUseCase: VerifySignedDocumentIntegrityUseCase,
    private readonly downloadSignatureArtifactUseCase: DownloadSignatureArtifactUseCase,
  ) {}

  @Get("tenders/:tenderId/signature-requirements")
  async listRequirements(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listSignatureRequirementsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/signature-requirements")
  @HttpCode(HttpStatus.CREATED)
  async detectRequirement(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(DetectSignatureRequirementBodySchema)) body: DetectSignatureRequirementBody,
  ) {
    return this.detectSignatureRequirementUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Post("signature-requirements/:id/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmRequirement(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) requirementId: string,
    @Body(new ZodValidationPipe(ConfirmRejectRequirementBodySchema)) body: ConfirmRejectRequirementBody,
  ) {
    return this.confirmSignatureRequirementUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, requirementId, comment: body.comment });
  }

  @Post("signature-requirements/:id/reject")
  @HttpCode(HttpStatus.OK)
  async rejectRequirement(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) requirementId: string,
    @Body(new ZodValidationPipe(ConfirmRejectRequirementBodySchema)) body: ConfirmRejectRequirementBody,
  ) {
    return this.rejectSignatureRequirementUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, requirementId, comment: body.comment });
  }

  @Get("tenders/:tenderId/signatories")
  async listSignatories(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listSignatoriesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/signatories")
  @HttpCode(HttpStatus.CREATED)
  async registerSignatory(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(RegisterSignatoryBodySchema)) body: RegisterSignatoryBody,
  ) {
    return this.registerSignatoryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Post("signatories/:id/verify")
  @HttpCode(HttpStatus.OK)
  async verifySignatory(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) signatoryId: string,
    @Body(new ZodValidationPipe(VerifySignatoryBodySchema)) body: VerifySignatoryBody,
  ) {
    return this.verifySignatoryAuthorityUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, signatoryId, approved: body.approved });
  }

  @Post("exports/:exportId/signature-transactions")
  @HttpCode(HttpStatus.CREATED)
  async prepare(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("exportId", new ZodValidationPipe(IdParamSchema)) exportJobId: string,
    @Body(new ZodValidationPipe(PrepareSignatureRequestBodySchema)) body: PrepareSignatureRequestBody,
  ) {
    return this.prepareSignatureRequestUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      exportJobId,
      signatoryIds: body.signatoryIds,
      requestedLevel: body.requestedLevel,
    });
  }

  @Get("signature-transactions/:id")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
  ) {
    return this.getSignatureTransactionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, transactionId });
  }

  @Post("signature-transactions/:id/start")
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
    @Body(new ZodValidationPipe(StartSignatureTransactionBodySchema)) body: StartSignatureTransactionBody,
  ) {
    return this.startSignatureTransactionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, transactionId, returnUrl: body.returnUrl });
  }

  @Post("signature-transactions/:id/sync")
  @HttpCode(HttpStatus.OK)
  async sync(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
  ) {
    return this.syncSignatureTransactionStatusUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, transactionId });
  }

  @Post("signature-transactions/:id/retrieve-artifacts")
  @HttpCode(HttpStatus.OK)
  async retrieveArtifacts(@CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string) {
    return this.retrieveSignedArtifactsUseCase.execute({ organizationId: membership.organizationId, transactionId });
  }

  @Post("signature-transactions/:id/verify")
  @HttpCode(HttpStatus.OK)
  async verifyIntegrity(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
  ) {
    return this.verifySignedDocumentIntegrityUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, transactionId });
  }

  @Post("signature-transactions/:id/signed-artifacts")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async importSignedDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importSignedDocumentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      transactionId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
    });
  }

  @Get("signature-transactions/:id/signed-document")
  async downloadSignedDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadSignatureArtifactUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      transactionId,
      kind: "SIGNED_DOCUMENT",
    });
    res.set({ "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${result.filename}"`, "Content-Length": result.sizeBytes.toString() });
    return new StreamableFile(result.stream);
  }

  @Get("signature-transactions/:id/evidence")
  async downloadEvidence(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) transactionId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadSignatureArtifactUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      transactionId,
      kind: "PROOF",
    });
    res.set({ "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${result.filename}"`, "Content-Length": result.sizeBytes.toString() });
    return new StreamableFile(result.stream);
  }

  @Get("tenders/:tenderId/signature-transactions")
  async listForTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listSignatureTransactionsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }
}
