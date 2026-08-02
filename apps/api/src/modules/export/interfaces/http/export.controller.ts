import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res, StreamableFile, UseFilters, UseGuards, Body } from "@nestjs/common";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { DownloadExportArtifactUseCase } from "../../application/use-cases/download-export-artifact.use-case";
import { GetExportJobUseCase } from "../../application/use-cases/get-export-job.use-case";
import { ListExportHistoryUseCase } from "../../application/use-cases/list-export-history.use-case";
import { PreviewExportUseCase } from "../../application/use-cases/preview-export.use-case";
import { ExportErrorFilter } from "./export-error.filter";
import { IdParamSchema, ListExportHistoryQuerySchema, PreviewExportBodySchema, type ListExportHistoryQuery, type PreviewExportBody } from "./schemas";

/** Mission Sprint 8A §22/§59 — jamais de route "générer un export final" exposée ici : le
 *  figeage FINAL n'est déclenché QUE par `ApproveFinalVersionUseCase` (module Validation), jamais
 *  directement par un acteur (mission §32 "aucune substitution silencieuse d'une version validée",
 *  §22 "un export final exige... l'approbation finale existe"). */
@Controller()
@UseFilters(ExportErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ExportController {
  constructor(
    private readonly previewExportUseCase: PreviewExportUseCase,
    private readonly getExportJobUseCase: GetExportJobUseCase,
    private readonly listExportHistoryUseCase: ListExportHistoryUseCase,
    private readonly downloadExportArtifactUseCase: DownloadExportArtifactUseCase,
  ) {}

  @Post("tenders/:tenderId/exports/preview")
  @HttpCode(HttpStatus.CREATED)
  async preview(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(PreviewExportBodySchema)) body: PreviewExportBody,
  ) {
    return this.previewExportUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      exportTemplateId: body.exportTemplateId,
      sections: body.sections,
    });
  }

  @Get("tenders/:tenderId/exports")
  async listHistory(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListExportHistoryQuerySchema)) query: ListExportHistoryQuery,
  ) {
    return this.listExportHistoryUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      mode: query.mode,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("exports/:exportId")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("exportId", new ZodValidationPipe(IdParamSchema)) exportId: string,
  ) {
    return this.getExportJobUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, exportJobId: exportId });
  }

  @Get("exports/:exportId/download")
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("exportId", new ZodValidationPipe(IdParamSchema)) exportId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadExportArtifactUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      exportJobId: exportId,
    });
    res.set({
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Content-Length": result.sizeBytes.toString(),
    });
    return new StreamableFile(result.stream);
  }
}
