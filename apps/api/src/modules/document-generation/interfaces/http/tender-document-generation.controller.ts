import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { GenerateDocumentUseCase } from "../../application/use-cases/generate-document.use-case";
import { ListGeneratedDocumentsUseCase } from "../../application/use-cases/list-generated-documents.use-case";
import { DocumentGenerationErrorFilter } from "./document-generation-error.filter";
import { GenerateDocumentBodySchema, IdParamSchema, type GenerateDocumentBody } from "./schemas";

/** Mission route conceptuelle `POST /tenders/:tenderId/documents/generate` — même convention de
 *  préfixe que `ChatController`/`WorkspaceController` : `/tenders/:id/...`, jamais de ressource
 *  top-level bare pour une action Tender-scopée. */
@Controller("tenders")
@UseFilters(DocumentGenerationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderDocumentGenerationController {
  constructor(
    private readonly generateDocumentUseCase: GenerateDocumentUseCase,
    private readonly listGeneratedDocumentsUseCase: ListGeneratedDocumentsUseCase,
  ) {}

  @Get(":tenderId/documents/generated")
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listGeneratedDocumentsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":tenderId/documents/generate")
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(GenerateDocumentBodySchema)) body: GenerateDocumentBody,
    @Req() request: RequestWithId,
  ) {
    return this.generateDocumentUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }
}
