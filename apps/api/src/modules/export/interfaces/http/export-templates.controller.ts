import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ActivateExportTemplateVersionUseCase } from "../../application/use-cases/activate-export-template-version.use-case";
import { CreateExportTemplateUseCase } from "../../application/use-cases/create-export-template.use-case";
import { CreateExportTemplateVersionUseCase } from "../../application/use-cases/create-export-template-version.use-case";
import { ListExportTemplatesUseCase } from "../../application/use-cases/list-export-templates.use-case";
import { ExportErrorFilter } from "./export-error.filter";
import { CreateExportTemplateBodySchema, CreateExportTemplateVersionBodySchema, IdParamSchema, type CreateExportTemplateBody, type CreateExportTemplateVersionBody } from "./schemas";

/** Mission Sprint 8A §16/§56 — gestion des templates, réservée OWNER/ORGANIZATION_ADMIN
 *  (`ExportPermission.ManageExportTemplates`, vérifié dans les use cases, jamais ici). */
@Controller("exports/templates")
@UseFilters(ExportErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ExportTemplatesController {
  constructor(
    private readonly createExportTemplateUseCase: CreateExportTemplateUseCase,
    private readonly createExportTemplateVersionUseCase: CreateExportTemplateVersionUseCase,
    private readonly activateExportTemplateVersionUseCase: ActivateExportTemplateVersionUseCase,
    private readonly listExportTemplatesUseCase: ListExportTemplatesUseCase,
  ) {}

  @Get()
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listExportTemplatesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateExportTemplateBodySchema)) body: CreateExportTemplateBody,
  ) {
    return this.createExportTemplateUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      documentType: body.documentType,
      name: body.name,
      description: body.description,
      format: body.format,
      config: body.config,
    });
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) exportTemplateId: string,
    @Body(new ZodValidationPipe(CreateExportTemplateVersionBodySchema)) body: CreateExportTemplateVersionBody,
  ) {
    return this.createExportTemplateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      exportTemplateId,
      format: body.format,
      config: body.config,
    });
  }

  @Post(":id/versions/:versionId/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) exportTemplateId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.activateExportTemplateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      exportTemplateId,
      versionId,
    });
  }
}
