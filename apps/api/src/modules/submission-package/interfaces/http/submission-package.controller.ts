import { Controller, Get, HttpCode, HttpStatus, Param, Post, Res, StreamableFile, UseFilters, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CreateSubmissionPackageUseCase } from "../../application/use-cases/create-submission-package.use-case";
import { DownloadSubmissionPackageUseCase } from "../../application/use-cases/download-submission-package.use-case";
import { GetSubmissionPackageUseCase } from "../../application/use-cases/get-submission-package.use-case";
import { ListSubmissionPackagesUseCase } from "../../application/use-cases/list-submission-packages.use-case";
import { SubmissionPackageErrorFilter } from "./submission-package-error.filter";
import { IdParamSchema } from "./schemas";

@Controller()
@UseFilters(SubmissionPackageErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SubmissionPackageController {
  constructor(
    private readonly createSubmissionPackageUseCase: CreateSubmissionPackageUseCase,
    private readonly getSubmissionPackageUseCase: GetSubmissionPackageUseCase,
    private readonly listSubmissionPackagesUseCase: ListSubmissionPackagesUseCase,
    private readonly downloadSubmissionPackageUseCase: DownloadSubmissionPackageUseCase,
  ) {}

  @Post("tenders/:tenderId/packages")
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.createSubmissionPackageUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/packages")
  async listForTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listSubmissionPackagesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("packages/:id")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) packageId: string,
  ) {
    return this.getSubmissionPackageUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, packageId });
  }

  @Get("packages/:id/download")
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) packageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadSubmissionPackageUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, packageId });
    res.set({ "Content-Type": result.contentType, "Content-Disposition": `attachment; filename="${result.filename}"`, "Content-Length": result.sizeBytes.toString() });
    return new StreamableFile(result.stream);
  }
}
