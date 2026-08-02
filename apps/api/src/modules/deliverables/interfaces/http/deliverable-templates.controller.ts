import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ActivateDeliverableTemplateVersionUseCase } from "../../application/use-cases/activate-deliverable-template-version.use-case";
import { CreateDeliverableTemplateUseCase } from "../../application/use-cases/create-deliverable-template.use-case";
import { CreateDeliverableTemplateVersionUseCase } from "../../application/use-cases/create-deliverable-template-version.use-case";
import { ListDeliverableTemplatesUseCase } from "../../application/use-cases/list-deliverable-templates.use-case";
import type { DeliverableType } from "../../domain/deliverable-type";
import type { ScopeLevel } from "../../domain/scope-level";
import { DeliverableErrorFilter } from "./deliverable-error.filter";
import {
  CreateDeliverableTemplateBodySchema,
  CreateDeliverableTemplateVersionBodySchema,
  IdParamSchema,
  type CreateDeliverableTemplateBody,
  type CreateDeliverableTemplateVersionBody,
} from "./schemas";

/** Mission Sprint 8A.1 §5/§17 — gestion des templates de mémoire, réservée OWNER/ORGANIZATION_ADMIN
 *  (`DeliverablePermission.ManageDeliverableTemplates`, vérifié dans les use cases, jamais ici). */
@Controller("deliverable-templates")
@UseFilters(DeliverableErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DeliverableTemplatesController {
  constructor(
    private readonly createDeliverableTemplateUseCase: CreateDeliverableTemplateUseCase,
    private readonly createDeliverableTemplateVersionUseCase: CreateDeliverableTemplateVersionUseCase,
    private readonly activateDeliverableTemplateVersionUseCase: ActivateDeliverableTemplateVersionUseCase,
    private readonly listDeliverableTemplatesUseCase: ListDeliverableTemplatesUseCase,
  ) {}

  @Get()
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listDeliverableTemplatesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateDeliverableTemplateBodySchema)) body: CreateDeliverableTemplateBody,
  ) {
    return this.createDeliverableTemplateUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      scopeLevel: body.scopeLevel as ScopeLevel,
      clientAccountId: body.clientAccountId,
      tenderId: body.tenderId,
      documentType: body.documentType as DeliverableType,
      name: body.name,
      description: body.description,
      note: body.note,
      sections: body.sections,
    });
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableTemplateId: string,
    @Body(new ZodValidationPipe(CreateDeliverableTemplateVersionBodySchema)) body: CreateDeliverableTemplateVersionBody,
  ) {
    return this.createDeliverableTemplateVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      deliverableTemplateId,
      sections: body.sections,
    });
  }

  @Post(":id/versions/:versionId/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) deliverableTemplateId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.activateDeliverableTemplateVersionUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, deliverableTemplateId, versionId });
  }
}
