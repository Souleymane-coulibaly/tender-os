import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toGeneratedDocumentRevisionSummary } from "../../../document-generation";
import {
  toTechnicalMemoSectionRequirementSummary,
  toTechnicalMemoSectionRevisionSummary,
  toTechnicalMemoSectionSummary,
  toTechnicalMemoSummary,
} from "../../application/dtos";
import { ConfirmTechnicalMemoRequirementCoverageUseCase } from "../../application/use-cases/confirm-technical-memo-requirement-coverage.use-case";
import { EditTechnicalMemoSectionUseCase } from "../../application/use-cases/edit-technical-memo-section.use-case";
import { ExportTechnicalMemoUseCase } from "../../application/use-cases/export-technical-memo.use-case";
import { GenerateTechnicalMemoSectionUseCase } from "../../application/use-cases/generate-technical-memo-section.use-case";
import { GetTechnicalMemoCoverageUseCase } from "../../application/use-cases/get-technical-memo-coverage.use-case";
import { GetTechnicalMemoUseCase } from "../../application/use-cases/get-technical-memo.use-case";
import { MapTechnicalMemoSectionsUseCase } from "../../application/use-cases/map-technical-memo-sections.use-case";
import { PrepareTechnicalMemoTemplateUseCase } from "../../application/use-cases/prepare-technical-memo-template.use-case";
import { ValidateTechnicalMemoSectionUseCase } from "../../application/use-cases/validate-technical-memo-section.use-case";
import { TechnicalMemoErrorFilter } from "./technical-memo-error.filter";
import {
  ConfirmRequirementCoverageBodySchema,
  EditTechnicalMemoSectionBodySchema,
  GenerateTechnicalMemoSectionBodySchema,
  IdParamSchema,
  type ConfirmRequirementCoverageBody,
  type EditTechnicalMemoSectionBody,
  type GenerateTechnicalMemoSectionBody,
} from "./schemas";

@Controller("technical-memos")
@UseFilters(TechnicalMemoErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TechnicalMemosController {
  constructor(
    private readonly getTechnicalMemoUseCase: GetTechnicalMemoUseCase,
    private readonly prepareTechnicalMemoTemplateUseCase: PrepareTechnicalMemoTemplateUseCase,
    private readonly mapTechnicalMemoSectionsUseCase: MapTechnicalMemoSectionsUseCase,
    private readonly generateTechnicalMemoSectionUseCase: GenerateTechnicalMemoSectionUseCase,
    private readonly getTechnicalMemoCoverageUseCase: GetTechnicalMemoCoverageUseCase,
    private readonly confirmTechnicalMemoRequirementCoverageUseCase: ConfirmTechnicalMemoRequirementCoverageUseCase,
    private readonly validateTechnicalMemoSectionUseCase: ValidateTechnicalMemoSectionUseCase,
    private readonly editTechnicalMemoSectionUseCase: EditTechnicalMemoSectionUseCase,
    private readonly exportTechnicalMemoUseCase: ExportTechnicalMemoUseCase,
  ) {}

  @Get(":technicalMemoId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
  ) {
    const result = await this.getTechnicalMemoUseCase.execute({ organizationId: membership.organizationId, technicalMemoId, actorId: actor.userId, actorRole: membership.role });
    return { memo: toTechnicalMemoSummary(result.memo), sections: result.sections.map(toTechnicalMemoSectionSummary) };
  }

  @Post(":technicalMemoId/prepare")
  @HttpCode(HttpStatus.OK)
  async prepare(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.prepareTechnicalMemoTemplateUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return { memo: toTechnicalMemoSummary(result.memo), sections: result.sections.map(toTechnicalMemoSectionSummary) };
  }

  @Post(":technicalMemoId/map")
  @HttpCode(HttpStatus.OK)
  async map(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Req() request: RequestWithId,
  ) {
    const links = await this.mapTechnicalMemoSectionsUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return links.map(toTechnicalMemoSectionRequirementSummary);
  }

  @Post(":technicalMemoId/sections/:sectionId/generate")
  @HttpCode(HttpStatus.OK)
  async generateSection(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(GenerateTechnicalMemoSectionBodySchema)) body: GenerateTechnicalMemoSectionBody,
    @Req() request: RequestWithId,
  ) {
    const revision = await this.generateTechnicalMemoSectionUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      technicalMemoSectionId: sectionId,
      actorId: actor.userId,
      actorRole: membership.role,
      userInstruction: body.userInstruction,
      requestId: request.id,
    });
    return toTechnicalMemoSectionRevisionSummary(revision);
  }

  @Get(":technicalMemoId/coverage")
  @HttpCode(HttpStatus.OK)
  async getCoverage(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
  ) {
    return this.getTechnicalMemoCoverageUseCase.execute({ organizationId: membership.organizationId, technicalMemoId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":technicalMemoId/requirements/:requirementLinkId/confirm-coverage")
  @HttpCode(HttpStatus.OK)
  async confirmRequirementCoverage(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Param("requirementLinkId", new ZodValidationPipe(IdParamSchema)) requirementLinkId: string,
    @Body(new ZodValidationPipe(ConfirmRequirementCoverageBodySchema)) body: ConfirmRequirementCoverageBody,
    @Req() request: RequestWithId,
  ) {
    const link = await this.confirmTechnicalMemoRequirementCoverageUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      technicalMemoSectionRequirementId: requirementLinkId,
      actorId: actor.userId,
      actorRole: membership.role,
      coverageStatus: body.coverageStatus,
      coverageReason: body.coverageReason,
      requestId: request.id,
    });
    return toTechnicalMemoSectionRequirementSummary(link);
  }

  @Post(":technicalMemoId/sections/:sectionId/validate")
  @HttpCode(HttpStatus.OK)
  async validateSection(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Req() request: RequestWithId,
  ) {
    const section = await this.validateTechnicalMemoSectionUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      technicalMemoSectionId: sectionId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return toTechnicalMemoSectionSummary(section);
  }

  @Post(":technicalMemoId/sections/:sectionId/edit")
  @HttpCode(HttpStatus.OK)
  async editSection(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Param("sectionId", new ZodValidationPipe(IdParamSchema)) sectionId: string,
    @Body(new ZodValidationPipe(EditTechnicalMemoSectionBodySchema)) body: EditTechnicalMemoSectionBody,
    @Req() request: RequestWithId,
  ) {
    const revision = await this.editTechnicalMemoSectionUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      technicalMemoSectionId: sectionId,
      content: body.content,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return toTechnicalMemoSectionRevisionSummary(revision);
  }

  @Post(":technicalMemoId/export")
  @HttpCode(HttpStatus.OK)
  async exportMemo(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("technicalMemoId", new ZodValidationPipe(IdParamSchema)) technicalMemoId: string,
    @Req() request: RequestWithId,
  ) {
    const revision = await this.exportTechnicalMemoUseCase.execute({
      organizationId: membership.organizationId,
      technicalMemoId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return toGeneratedDocumentRevisionSummary(revision);
  }
}
