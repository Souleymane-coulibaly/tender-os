import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toPackageArtifactSummary, toPackageItemSummary, toResponsePackageSummary, toResponsePackageVersionSummary } from "../../application/dtos";
import { BuildResponsePackageVersionUseCase } from "../../application/use-cases/build-response-package-version.use-case";
import { CorrectPackageItemQualificationUseCase } from "../../application/use-cases/correct-package-item-qualification.use-case";
import { GenerateResponsePackageZipUseCase } from "../../application/use-cases/generate-response-package-zip.use-case";
import { GetPackageCompletenessUseCase } from "../../application/use-cases/get-package-completeness.use-case";
import { GetResponsePackageUseCase } from "../../application/use-cases/get-response-package.use-case";
import { SelectPackageItemDocumentUseCase } from "../../application/use-cases/select-package-item-document.use-case";
import { ValidateResponsePackageVersionUseCase } from "../../application/use-cases/validate-response-package-version.use-case";
import { ResponsePackageErrorFilter } from "./response-package-error.filter";
import {
  CorrectPackageItemQualificationBodySchema,
  IdParamSchema,
  SelectPackageItemDocumentBodySchema,
  type CorrectPackageItemQualificationBody,
  type SelectPackageItemDocumentBody,
} from "./schemas";

@Controller("response-packages")
@UseFilters(ResponsePackageErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ResponsePackagesController {
  constructor(
    private readonly getResponsePackageUseCase: GetResponsePackageUseCase,
    private readonly buildVersionUseCase: BuildResponsePackageVersionUseCase,
    private readonly correctQualificationUseCase: CorrectPackageItemQualificationUseCase,
    private readonly selectDocumentUseCase: SelectPackageItemDocumentUseCase,
    private readonly getCompletenessUseCase: GetPackageCompletenessUseCase,
    private readonly validateVersionUseCase: ValidateResponsePackageVersionUseCase,
    private readonly generateZipUseCase: GenerateResponsePackageZipUseCase,
  ) {}

  @Get(":responsePackageId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Query("versionId") versionId?: string,
  ) {
    const result = await this.getResponsePackageUseCase.execute({
      organizationId: membership.organizationId,
      responsePackageId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageVersionId: versionId && IdParamSchema.safeParse(versionId).success ? versionId : undefined,
    });
    return {
      responsePackage: toResponsePackageSummary(result.responsePackage),
      versions: result.versions.map(toResponsePackageVersionSummary),
      items: result.items.map(toPackageItemSummary),
      artifacts: result.artifacts.map(toPackageArtifactSummary),
    };
  }

  @Post(":responsePackageId/build")
  @HttpCode(HttpStatus.CREATED)
  async build(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.buildVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      requestId: request.id,
    });
    return { version: toResponsePackageVersionSummary(result.version), items: result.items.map(toPackageItemSummary) };
  }

  @Patch(":responsePackageId/items/:itemId/qualification")
  @HttpCode(HttpStatus.OK)
  async correctQualification(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(CorrectPackageItemQualificationBodySchema)) body: CorrectPackageItemQualificationBody,
    @Req() request: RequestWithId,
  ) {
    const item = await this.correctQualificationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      packageItemId: itemId,
      requirementType: body.requirementType,
      applicabilityStatus: body.applicabilityStatus,
      conditionText: body.conditionText,
      requestId: request.id,
    });
    return toPackageItemSummary(item);
  }

  @Patch(":responsePackageId/items/:itemId/document")
  @HttpCode(HttpStatus.OK)
  async selectDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("itemId", new ZodValidationPipe(IdParamSchema)) itemId: string,
    @Body(new ZodValidationPipe(SelectPackageItemDocumentBodySchema)) body: SelectPackageItemDocumentBody,
    @Req() request: RequestWithId,
  ) {
    const item = await this.selectDocumentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      packageItemId: itemId,
      documentId: body.documentId,
      documentVersionId: body.documentVersionId,
      requestId: request.id,
    });
    return toPackageItemSummary(item);
  }

  @Get(":responsePackageId/versions/:versionId/completeness")
  @HttpCode(HttpStatus.OK)
  async getCompleteness(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.getCompletenessUseCase.execute({ organizationId: membership.organizationId, responsePackageId, responsePackageVersionId: versionId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":responsePackageId/versions/:versionId/validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Req() request: RequestWithId,
  ) {
    const version = await this.validateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      responsePackageVersionId: versionId,
      requestId: request.id,
    });
    return toResponsePackageVersionSummary(version);
  }

  /** Action EXPLICITE et SÉPARÉE de la validation (mission §55), jamais automatique. */
  @Post(":responsePackageId/versions/:versionId/generate")
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("responsePackageId", new ZodValidationPipe(IdParamSchema)) responsePackageId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.generateZipUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      responsePackageId,
      responsePackageVersionId: versionId,
      requestId: request.id,
    });
    return toPackageArtifactSummary(result.artifact);
  }
}
