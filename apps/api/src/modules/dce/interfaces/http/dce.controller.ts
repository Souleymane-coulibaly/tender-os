import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { memoryStorage } from "multer";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { DCE_CONFIG, type DceConfig } from "../../infrastructure/dce-config";
import { CreateDceUseCase } from "../../application/use-cases/create-dce.use-case";
import { DeleteDceDocumentUseCase } from "../../application/use-cases/delete-dce-document.use-case";
import { DownloadDceDocumentUseCase } from "../../application/use-cases/download-dce-document.use-case";
import { GetDceUseCase } from "../../application/use-cases/get-dce.use-case";
import { GetDceDocumentUseCase } from "../../application/use-cases/get-dce-document.use-case";
import { ImportDceFilesUseCase } from "../../application/use-cases/import-dce-files.use-case";
import { ImportDceZipUseCase } from "../../application/use-cases/import-dce-zip.use-case";
import { ListDceDocumentsUseCase } from "../../application/use-cases/list-dce-documents.use-case";
import { ReplaceDceDocumentUseCase } from "../../application/use-cases/replace-dce-document.use-case";
import { DceErrorFilter } from "./dce-error.filter";
import { presentDce, presentDceDocument, presentImportResult } from "./presenters";
import { IdParamSchema } from "./schemas";

/** Plafond brut Multer — filet de sécurité en amont des limites métier configurables (voir
 *  MULTER_HARD_CEILING_BYTES dans documents.controller.ts, même motif). */
const MULTER_HARD_CEILING_BYTES = 100 * 1024 * 1024;
/** Nombre brut maximal de fichiers acceptés par Multer en une requête — filet de sécurité en
 *  amont de la limite métier configurable (DCE_MAX_FILES_PER_IMPORT), volontairement plus
 *  généreux qu'elle pour que la limite métier produise toujours l'erreur applicative attendue
 *  plutôt qu'un rejet brut de Multer. */
const MULTER_HARD_CEILING_FILE_COUNT = 100;

/** Route imbriquée sous /tenders (même motif que TenderDocumentsController/TenderLotsController :
 *  dépendance autorisée DCE → Tenders/Documents, jamais l'inverse). */
@Controller("tenders/:tenderId/dce")
@UseFilters(DceErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DceController {
  constructor(
    private readonly createDceUseCase: CreateDceUseCase,
    private readonly getDceUseCase: GetDceUseCase,
    private readonly importDceFilesUseCase: ImportDceFilesUseCase,
    private readonly importDceZipUseCase: ImportDceZipUseCase,
    private readonly listDceDocumentsUseCase: ListDceDocumentsUseCase,
    private readonly getDceDocumentUseCase: GetDceDocumentUseCase,
    private readonly downloadDceDocumentUseCase: DownloadDceDocumentUseCase,
    private readonly deleteDceDocumentUseCase: DeleteDceDocumentUseCase,
    private readonly replaceDceDocumentUseCase: ReplaceDceDocumentUseCase,
    @Inject(DCE_CONFIG) private readonly dceConfig: DceConfig,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createDceUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentDce(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const result = await this.getDceUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return presentDce(result);
  }

  @Post("documents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FilesInterceptor("files", MULTER_HARD_CEILING_FILE_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MULTER_HARD_CEILING_BYTES },
    }),
  )
  async importFiles(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() request: RequestWithId,
  ) {
    const result = await this.importDceFilesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      files: (files ?? []).map((file) => ({
        buffer: file.buffer,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
      })),
      maxFileSizeBytes: this.dceConfig.maxFileSizeBytes,
      maxFilesPerImport: this.dceConfig.maxFilesPerImport,
      requestId: request.id,
    });
    return presentImportResult(result);
  }

  @Post("import-zip")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("archive", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async importZip(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @UploadedFile() archive: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.importDceZipUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      zipBuffer: archive.buffer,
      maxFileSizeBytes: this.dceConfig.maxFileSizeBytes,
      maxFilesPerImport: this.dceConfig.maxFilesPerImport,
      zipLimits: this.dceConfig.zipLimits,
      requestId: request.id,
    });
    return presentImportResult(result);
  }

  @Get("documents")
  @HttpCode(HttpStatus.OK)
  async listDocuments(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const documents = await this.listDceDocumentsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return documents.map(presentDceDocument);
  }

  @Get("documents/:documentId")
  @HttpCode(HttpStatus.OK)
  async getDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const result = await this.getDceDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorRole: membership.role,
    });
    return presentDceDocument(result);
  }

  @Get("documents/:documentId/download")
  @HttpCode(HttpStatus.OK)
  async downloadDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.downloadDceDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
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

  @Put("documents/:documentId")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async replaceDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.replaceDceDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      maxFileSizeBytes: this.dceConfig.maxFileSizeBytes,
      requestId: request.id,
    });
    return presentDceDocument(result);
  }

  @Delete("documents/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteDceDocumentUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }
}
