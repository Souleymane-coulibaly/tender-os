import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { getRequiredEnv } from "../../../../shared-kernel/env";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddDocumentVersionUseCase } from "../../application/use-cases/add-document-version.use-case";
import { ArchiveDocumentUseCase } from "../../application/use-cases/archive-document.use-case";
import { AttachDocumentToTenderUseCase } from "../../application/use-cases/attach-document-to-tender.use-case";
import { CreateDocumentWithFirstVersionUseCase } from "../../application/use-cases/create-document-with-first-version.use-case";
import { DeleteDocumentUseCase } from "../../application/use-cases/delete-document.use-case";
import { DetachDocumentFromTenderUseCase } from "../../application/use-cases/detach-document-from-tender.use-case";
import { DownloadDocumentVersionUseCase } from "../../application/use-cases/download-document-version.use-case";
import { GetDocumentUseCase } from "../../application/use-cases/get-document.use-case";
import { ListDocumentVersionsUseCase } from "../../application/use-cases/list-document-versions.use-case";
import { ListOrganizationDocumentsUseCase } from "../../application/use-cases/list-organization-documents.use-case";
import { RestoreDocumentUseCase } from "../../application/use-cases/restore-document.use-case";
import { UpdateDocumentMetadataUseCase } from "../../application/use-cases/update-document-metadata.use-case";
import { DocumentsErrorFilter } from "./documents-error.filter";
import { presentDocument, presentDocumentTenderAssociation, presentDocumentVersion, presentPage } from "./presenters";
import {
  AddDocumentVersionBodySchema,
  CreateDocumentBodySchema,
  IdParamSchema,
  ListDocumentsQuerySchema,
  UpdateDocumentMetadataBodySchema,
  type AddDocumentVersionBody,
  type CreateDocumentBody,
  type ListDocumentsQuery,
  type UpdateDocumentMetadataBody,
} from "./schemas";

/** Plafond brut Multer — filet de sécurité en amont de la limite métier configurable
 *  (DOCUMENT_MAX_FILE_SIZE_MB, appliquée par validateIncomingFile) : évite de bufferiser en
 *  mémoire un corps de requête arbitrairement volumineux avant même la validation applicative. */
const MULTER_HARD_CEILING_BYTES = 100 * 1024 * 1024;

function maxDocumentFileSizeBytes(): number {
  return Number(getRequiredEnv("DOCUMENT_MAX_FILE_SIZE_MB")) * 1024 * 1024;
}

@Controller("documents")
@UseFilters(DocumentsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DocumentsController {
  constructor(
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly addDocumentVersionUseCase: AddDocumentVersionUseCase,
    private readonly getDocumentUseCase: GetDocumentUseCase,
    private readonly listOrganizationDocumentsUseCase: ListOrganizationDocumentsUseCase,
    private readonly updateDocumentMetadataUseCase: UpdateDocumentMetadataUseCase,
    private readonly archiveDocumentUseCase: ArchiveDocumentUseCase,
    private readonly restoreDocumentUseCase: RestoreDocumentUseCase,
    private readonly deleteDocumentUseCase: DeleteDocumentUseCase,
    private readonly listDocumentVersionsUseCase: ListDocumentVersionsUseCase,
    private readonly downloadDocumentVersionUseCase: DownloadDocumentVersionUseCase,
    private readonly attachDocumentToTenderUseCase: AttachDocumentToTenderUseCase,
    private readonly detachDocumentFromTenderUseCase: DetachDocumentFromTenderUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateDocumentBodySchema)) body: CreateDocumentBody,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createDocumentWithFirstVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      title: body.title,
      description: body.description,
      origin: body.origin,
      domain: body.domain,
      category: body.category,
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      maxFileSizeBytes: maxDocumentFileSizeBytes(),
      requestId: request.id,
    });
    return presentDocument(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListDocumentsQuerySchema)) query: ListDocumentsQuery,
  ) {
    const result = await this.listOrganizationDocumentsUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      ...query,
    });
    return presentPage(result.items.map(presentDocument), result.nextCursor);
  }

  @Get(":documentId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const result = await this.getDocumentUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorRole: membership.role,
    });
    return presentDocument(result);
  }

  @Patch(":documentId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(UpdateDocumentMetadataBodySchema)) body: UpdateDocumentMetadataBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateDocumentMetadataUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentDocument(result);
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteDocumentUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }

  @Post(":documentId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.archiveDocumentUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDocument(result);
  }

  @Post(":documentId/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.restoreDocumentUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDocument(result);
  }

  // ---- Versions ----

  @Post(":documentId/versions")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async addVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    // Aucun champ texte pour cette route (schéma vide) — seul le fichier multipart est attendu.
    @Body(new ZodValidationPipe(AddDocumentVersionBodySchema)) _body: AddDocumentVersionBody,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addDocumentVersionUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      maxFileSizeBytes: maxDocumentFileSizeBytes(),
      requestId: request.id,
    });
    return presentDocument(result);
  }

  @Get(":documentId/versions")
  @HttpCode(HttpStatus.OK)
  async listVersions(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const versions = await this.listDocumentVersionsUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      actorRole: membership.role,
    });
    return versions.map(presentDocumentVersion);
  }

  @Get(":documentId/download")
  @HttpCode(HttpStatus.OK)
  async downloadCurrent(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.streamDownload(membership, documentId, undefined, res);
  }

  @Get(":documentId/versions/:versionId/download")
  @HttpCode(HttpStatus.OK)
  async downloadVersion(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.streamDownload(membership, documentId, versionId, res);
  }

  private async streamDownload(
    membership: MembershipContext,
    documentId: string,
    versionId: string | undefined,
    res: Response,
  ): Promise<StreamableFile | void> {
    const result = await this.downloadDocumentVersionUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      versionId,
      actorRole: membership.role,
    });

    if (result.kind === "redirect") {
      res.redirect(result.url);
      return;
    }

    res.set({
      "Content-Type": result.contentType,
      "Content-Length": result.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
    });
    return new StreamableFile(result.stream);
  }

  // ---- Association avec un Tender ----

  @Post(":documentId/tenders/:tenderId")
  @HttpCode(HttpStatus.CREATED)
  async attachToTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.attachDocumentToTenderUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDocumentTenderAssociation(result);
  }

  @Delete(":documentId/tenders/:tenderId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachFromTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    await this.detachDocumentFromTenderUseCase.execute({
      organizationId: membership.organizationId,
      documentId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }
}
