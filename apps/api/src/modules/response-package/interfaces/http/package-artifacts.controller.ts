import { Controller, Get, HttpCode, HttpStatus, Param, Req, Res, StreamableFile, UseFilters, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { DownloadResponsePackageArtifactUseCase } from "../../application/use-cases/download-response-package-artifact.use-case";
import { ResponsePackageErrorFilter } from "./response-package-error.filter";
import { IdParamSchema } from "./schemas";

/** Mission §65/§76 — toutes les autorisations revérifiées côté backend, jamais une URL publique
 *  permanente : le flux est relayé, jamais un lien de stockage direct exposé. */
@Controller("response-packages")
@UseFilters(ResponsePackageErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class PackageArtifactsController {
  constructor(private readonly downloadUseCase: DownloadResponsePackageArtifactUseCase) {}

  @Get(":responsePackageId/versions/:versionId/download")
  @HttpCode(HttpStatus.OK)
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Req() request: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const result = await this.downloadUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      responsePackageVersionId: versionId,
      requestId: request.id,
    });

    res.set({
      "Content-Type": result.mimeType,
      "Content-Length": result.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename="${result.fileName.replace(/"/g, "")}"`,
    });
    return new StreamableFile(result.stream);
  }
}
