import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards, UseInterceptors, UploadedFile } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ActivateDocumentTemplateVersionUseCase } from "../../application/use-cases/activate-document-template-version.use-case";
import { CreateDocumentTemplateUseCase } from "../../application/use-cases/create-document-template.use-case";
import { CreateDocumentTemplateVersionUseCase } from "../../application/use-cases/create-document-template-version.use-case";
import { GetDocumentTemplateUseCase } from "../../application/use-cases/get-document-template.use-case";
import { ListDocumentTemplatesUseCase } from "../../application/use-cases/list-document-templates.use-case";
import { DocumentGenerationErrorFilter } from "./document-generation-error.filter";
import {
  CreateDocumentTemplateBodySchema,
  CreateDocumentTemplateVersionBodySchema,
  IdParamSchema,
  parseFieldMappingsField,
  type CreateDocumentTemplateBody,
  type CreateDocumentTemplateVersionBody,
} from "./schemas";

// Plafond brut Multer — même motif que `DocumentsController` (filet de sécurité en amont de la
// validation applicative de `JszipTemplateUploadValidator`).
const MULTER_HARD_CEILING_BYTES = 25 * 1024 * 1024;

@Controller("document-templates")
@UseFilters(DocumentGenerationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DocumentTemplatesController {
  constructor(
    private readonly createDocumentTemplateUseCase: CreateDocumentTemplateUseCase,
    private readonly createDocumentTemplateVersionUseCase: CreateDocumentTemplateVersionUseCase,
    private readonly activateDocumentTemplateVersionUseCase: ActivateDocumentTemplateVersionUseCase,
    private readonly listDocumentTemplatesUseCase: ListDocumentTemplatesUseCase,
    private readonly getDocumentTemplateUseCase: GetDocumentTemplateUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listDocumentTemplatesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateDocumentTemplateBodySchema)) body: CreateDocumentTemplateBody,
    @Req() request: RequestWithId,
  ) {
    return this.createDocumentTemplateUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Get(":templateId")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentMembershipContext() membership: MembershipContext, @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string) {
    return this.getDocumentTemplateUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, documentTemplateId: templateId });
  }

  @Post(":templateId/versions")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async createVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string,
    @Body(new ZodValidationPipe(CreateDocumentTemplateVersionBodySchema)) body: CreateDocumentTemplateVersionBody,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    return this.createDocumentTemplateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      documentTemplateId: templateId,
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      fieldMappings: parseFieldMappingsField(body.fieldMappings),
      allowPartialGeneration: body.allowPartialGeneration === "true",
      requestId: request.id,
    });
  }

  @Post(":templateId/versions/:versionId/activate")
  @HttpCode(HttpStatus.OK)
  async activateVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Req() request: RequestWithId,
  ) {
    return this.activateDocumentTemplateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      documentTemplateId: templateId,
      versionId,
      requestId: request.id,
    });
  }
}
