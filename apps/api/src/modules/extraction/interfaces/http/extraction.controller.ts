import { Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { GetDocumentExtractionUseCase } from "../../application/use-cases/get-document-extraction.use-case";
import { RetryDocumentExtractionUseCase } from "../../application/use-cases/retry-document-extraction.use-case";
import { StartDocumentExtractionUseCase } from "../../application/use-cases/start-document-extraction.use-case";
import { ExtractionErrorFilter } from "./extraction-error.filter";
import { presentDocumentExtraction } from "./presenters";
import { IdParamSchema } from "./schemas";

/** Route imbriquée sous /tenders/:tenderId/dce/documents/:documentId (mission Sprint 3 §17,
 *  minimale : déclenchement, suivi, relance — jamais d'UI complète ni de lecture du contenu
 *  extrait/des chunks dans cette tranche, hors périmètre explicite). */
@Controller("tenders/:tenderId/dce/documents/:documentId/extraction")
@UseFilters(ExtractionErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ExtractionController {
  constructor(
    private readonly startDocumentExtractionUseCase: StartDocumentExtractionUseCase,
    private readonly getDocumentExtractionUseCase: GetDocumentExtractionUseCase,
    private readonly retryDocumentExtractionUseCase: RetryDocumentExtractionUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.startDocumentExtractionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDocumentExtraction(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const result = await this.getDocumentExtractionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return presentDocumentExtraction(result);
  }

  @Post("retry")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.retryDocumentExtractionUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDocumentExtraction(result);
  }
}
