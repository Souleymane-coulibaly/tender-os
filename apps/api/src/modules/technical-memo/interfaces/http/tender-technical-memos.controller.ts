import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toTechnicalMemoSectionSummary, toTechnicalMemoSummary } from "../../application/dtos";
import { CreateTechnicalMemoUseCase } from "../../application/use-cases/create-technical-memo.use-case";
import { ListTechnicalMemosUseCase } from "../../application/use-cases/list-technical-memos.use-case";
import { TechnicalMemoErrorFilter } from "./technical-memo-error.filter";
import { CreateTechnicalMemoBodySchema, IdParamSchema, type CreateTechnicalMemoBody } from "./schemas";

const MULTER_HARD_CEILING_BYTES = 25 * 1024 * 1024;

/** Mission route conceptuelle `POST /tenders/:tenderId/technical-memos` — même convention de
 *  préfixe que `TenderDocumentGenerationController`/`ChatController` : `/tenders/:id/...`. */
@Controller("tenders")
@UseFilters(TechnicalMemoErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderTechnicalMemosController {
  constructor(
    private readonly createTechnicalMemoUseCase: CreateTechnicalMemoUseCase,
    private readonly listTechnicalMemosUseCase: ListTechnicalMemosUseCase,
  ) {}

  @Get(":tenderId/technical-memos")
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const memos = await this.listTechnicalMemosUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role });
    return memos.map(toTechnicalMemoSummary);
  }

  @Post(":tenderId/technical-memos")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateTechnicalMemoBodySchema)) body: CreateTechnicalMemoBody,
    @Req() request: RequestWithId,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const result = await this.createTechnicalMemoUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      lotId: body.lotId,
      templateOrigin: body.templateOrigin,
      file: file ? { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype } : undefined,
      requestId: request.id,
    });
    return { memo: toTechnicalMemoSummary(result.memo), sections: result.sections.map(toTechnicalMemoSectionSummary) };
  }
}
