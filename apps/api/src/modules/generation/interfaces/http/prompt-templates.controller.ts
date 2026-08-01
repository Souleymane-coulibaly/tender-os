import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ActivatePromptVersionUseCase } from "../../application/use-cases/activate-prompt-version.use-case";
import { ArchivePromptTemplateUseCase } from "../../application/use-cases/archive-prompt-template.use-case";
import { CreatePromptTemplateUseCase } from "../../application/use-cases/create-prompt-template.use-case";
import { CreatePromptVersionUseCase } from "../../application/use-cases/create-prompt-version.use-case";
import { GetPromptTemplateUseCase } from "../../application/use-cases/get-prompt-template.use-case";
import { ListPromptTemplatesUseCase } from "../../application/use-cases/list-prompt-templates.use-case";
import { GenerationErrorFilter } from "./generation-error.filter";
import { presentPromptTemplate, presentPromptVersion } from "./presenters";
import {
  CreatePromptTemplateBodySchema,
  CreatePromptVersionBodySchema,
  IdParamSchema,
  ListPromptTemplatesQuerySchema,
  type CreatePromptTemplateBody,
  type CreatePromptVersionBody,
  type ListPromptTemplatesQuery,
} from "./schemas";

/** Réservé à OWNER/ORGANIZATION_ADMIN (`GenerationPermission.ManagePromptTemplates`, vérifié dans
 *  les use cases, jamais ici — mission §"Les contrôleurs doivent rester minces"). */
@Controller("prompt-templates")
@UseFilters(GenerationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class PromptTemplatesController {
  constructor(
    private readonly createPromptTemplateUseCase: CreatePromptTemplateUseCase,
    private readonly createPromptVersionUseCase: CreatePromptVersionUseCase,
    private readonly activatePromptVersionUseCase: ActivatePromptVersionUseCase,
    private readonly archivePromptTemplateUseCase: ArchivePromptTemplateUseCase,
    private readonly getPromptTemplateUseCase: GetPromptTemplateUseCase,
    private readonly listPromptTemplatesUseCase: ListPromptTemplatesUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreatePromptTemplateBodySchema)) body: CreatePromptTemplateBody,
  ) {
    const result = await this.createPromptTemplateUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      taskType: body.taskType as never,
      name: body.name,
      description: body.description,
      outputMode: body.outputMode as never,
      structuredSchemaKey: body.structuredSchemaKey,
    });
    return presentPromptTemplate(result);
  }

  @Get()
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListPromptTemplatesQuerySchema)) query: ListPromptTemplatesQuery,
  ) {
    const result = await this.listPromptTemplatesUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      includeArchived: query.includeArchived,
    });
    return result.map(presentPromptTemplate);
  }

  @Get(":templateId")
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string,
  ) {
    const result = await this.getPromptTemplateUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      templateId,
    });
    return { template: presentPromptTemplate(result.template), versions: result.versions.map(presentPromptVersion) };
  }

  @Post(":templateId/versions")
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string,
    @Body(new ZodValidationPipe(CreatePromptVersionBodySchema)) body: CreatePromptVersionBody,
  ) {
    const result = await this.createPromptVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      authorUserId: actor.userId,
      promptTemplateId: templateId,
      systemPrompt: body.systemPrompt,
      userPromptTemplate: body.userPromptTemplate,
      requiredVariables: body.requiredVariables,
    });
    return presentPromptVersion(result);
  }

  @Post(":templateId/versions/:versionId/activate")
  @HttpCode(HttpStatus.OK)
  async activateVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    const result = await this.activatePromptVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      versionId,
    });
    return presentPromptVersion(result);
  }

  @Post(":templateId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("templateId", new ZodValidationPipe(IdParamSchema)) templateId: string,
  ) {
    const result = await this.archivePromptTemplateUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      templateId,
    });
    return presentPromptTemplate(result);
  }
}
