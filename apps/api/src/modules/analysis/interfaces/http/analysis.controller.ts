import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CancelAnalysisUseCase } from "../../application/use-cases/cancel-analysis.use-case";
import { GetAnalysisUseCase } from "../../application/use-cases/get-analysis.use-case";
import { RetryAnalysisUseCase } from "../../application/use-cases/retry-analysis.use-case";
import { StartDocumentAnalysisUseCase } from "../../application/use-cases/start-document-analysis.use-case";
import { StartTenderAnalysisUseCase } from "../../application/use-cases/start-tender-analysis.use-case";
import { AnalysisErrorFilter } from "./analysis-error.filter";
import { presentAnalysisJob } from "./presenters";
import { IdParamSchema } from "./schemas";

/** Socle technique minimal (mission Sprint 4.1 §"API HTTP minimale") — jamais d'UI complète, jamais
 *  de lecture du contenu du corpus analysé ni de la réponse brute du provider. Deux routes de
 *  déclenchement imbriquées sous /tenders/:tenderId (même motif que DCE/Extraction — cohérence
 *  d'organisation déjà établie), trois routes de lecture/relance/annulation adressées directement
 *  par `analysisId` (l'organisation est résolue par le membership, jamais par l'URL). */
@Controller()
@UseFilters(AnalysisErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AnalysisController {
  constructor(
    private readonly startTenderAnalysisUseCase: StartTenderAnalysisUseCase,
    private readonly startDocumentAnalysisUseCase: StartDocumentAnalysisUseCase,
    private readonly getAnalysisUseCase: GetAnalysisUseCase,
    private readonly retryAnalysisUseCase: RetryAnalysisUseCase,
    private readonly cancelAnalysisUseCase: CancelAnalysisUseCase,
  ) {}

  @Post("tenders/:tenderId/analyses")
  @HttpCode(HttpStatus.ACCEPTED)
  async startTenderAnalysis(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.startTenderAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Post("tenders/:tenderId/documents/:documentId/analyses")
  @HttpCode(HttpStatus.ACCEPTED)
  async startDocumentAnalysis(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.startDocumentAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Get("analyses/:analysisId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
  ) {
    const result = await this.getAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorRole: membership.role,
    });
    return presentAnalysisJob(result);
  }

  @Post("analyses/:analysisId/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.retryAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Post("analyses/:analysisId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.cancelAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }
}
