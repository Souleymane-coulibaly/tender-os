import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res, StreamableFile, UseFilters, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { DownloadGeneratedDocumentRevisionUseCase } from "../../application/use-cases/download-generated-document-revision.use-case";
import { GetGeneratedDocumentUseCase } from "../../application/use-cases/get-generated-document.use-case";
import { RegenerateDocumentUseCase } from "../../application/use-cases/regenerate-document.use-case";
import { DocumentGenerationErrorFilter } from "./document-generation-error.filter";
import { IdParamSchema, RegenerateDocumentBodySchema, type RegenerateDocumentBody } from "./schemas";

/** RFC 6266/5987 — un en-tête HTTP n'accepte que du Latin-1/ASCII (`ERR_INVALID_CHAR` sinon dès
 *  qu'un titre généré contient un caractère accentué, ex. "Mémoire technique — démonstration.docx",
 *  mission "caractères accentués" testés bout-en-bout). `filename=` porte un repli ASCII sûr,
 *  `filename*=UTF-8''...` porte le nom réel — tout client HTTP moderne préfère ce second paramètre. */
function buildContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

@Controller()
@UseFilters(DocumentGenerationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class GeneratedDocumentsController {
  constructor(
    private readonly getGeneratedDocumentUseCase: GetGeneratedDocumentUseCase,
    private readonly regenerateDocumentUseCase: RegenerateDocumentUseCase,
    private readonly downloadGeneratedDocumentRevisionUseCase: DownloadGeneratedDocumentRevisionUseCase,
  ) {}

  @Get("generated-documents/:id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.getGeneratedDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, generatedDocumentId: id });
  }

  @Get("generated-documents/:id/revisions")
  @HttpCode(HttpStatus.OK)
  async listRevisions(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.getGeneratedDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, generatedDocumentId: id });
  }

  @Post("generated-documents/:id/regenerate")
  @HttpCode(HttpStatus.CREATED)
  async regenerate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(RegenerateDocumentBodySchema)) body: RegenerateDocumentBody,
    @Req() request: RequestWithId,
  ) {
    return this.regenerateDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, generatedDocumentId: id, ...body, requestId: request.id });
  }

  /** Jamais une URL publique permanente — le fichier est toujours diffusé après vérification
   *  complète (voir `DownloadGeneratedDocumentRevisionUseCase`), même discipline que
   *  `DocumentsController#download`. */
  @Get("document-revisions/:id/download")
  @HttpCode(HttpStatus.OK)
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const download = await this.downloadGeneratedDocumentRevisionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, revisionId: id });
    res.set({
      "Content-Type": download.contentType,
      "Content-Length": download.sizeBytes.toString(),
      "Content-Disposition": buildContentDisposition(download.filename),
    });
    return new StreamableFile(download.stream);
  }
}
