import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ActivateDocumentThemeVersionUseCase } from "../../application/use-cases/activate-document-theme-version.use-case";
import { CreateDocumentThemeUseCase } from "../../application/use-cases/create-document-theme.use-case";
import { CreateDocumentThemeVersionUseCase } from "../../application/use-cases/create-document-theme-version.use-case";
import { ListDocumentThemesUseCase } from "../../application/use-cases/list-document-themes.use-case";
import type { ScopeLevel } from "../../domain/scope-level";
import { DeliverableErrorFilter } from "./deliverable-error.filter";
import { CreateDocumentThemeBodySchema, CreateDocumentThemeVersionBodySchema, IdParamSchema, type CreateDocumentThemeBody, type CreateDocumentThemeVersionBody } from "./schemas";

/** Mission Sprint 8A.1 §6/§17 — gestion de l'identité documentaire, réservée OWNER/ORGANIZATION_ADMIN
 *  (`DeliverablePermission.ManageDocumentThemes`, vérifié dans les use cases, jamais ici). */
@Controller("document-themes")
@UseFilters(DeliverableErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class DocumentThemesController {
  constructor(
    private readonly createDocumentThemeUseCase: CreateDocumentThemeUseCase,
    private readonly createDocumentThemeVersionUseCase: CreateDocumentThemeVersionUseCase,
    private readonly activateDocumentThemeVersionUseCase: ActivateDocumentThemeVersionUseCase,
    private readonly listDocumentThemesUseCase: ListDocumentThemesUseCase,
  ) {}

  @Get()
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listDocumentThemesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateDocumentThemeBodySchema)) body: CreateDocumentThemeBody,
  ) {
    return this.createDocumentThemeUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      scopeLevel: body.scopeLevel as ScopeLevel,
      clientAccountId: body.clientAccountId,
      tenderId: body.tenderId,
      name: body.name,
      logoStorageKey: body.logoStorageKey,
      accentColor: body.accentColor,
      fontFamily: body.fontFamily,
      config: body.config ?? {},
    });
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  async createVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentThemeId: string,
    @Body(new ZodValidationPipe(CreateDocumentThemeVersionBodySchema)) body: CreateDocumentThemeVersionBody,
  ) {
    return this.createDocumentThemeVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      createdBy: actor.userId,
      documentThemeId,
      logoStorageKey: body.logoStorageKey,
      accentColor: body.accentColor,
      fontFamily: body.fontFamily,
      config: body.config ?? {},
    });
  }

  @Post(":id/versions/:versionId/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentThemeId: string,
    @Param("versionId", new ZodValidationPipe(IdParamSchema)) versionId: string,
  ) {
    return this.activateDocumentThemeVersionUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, documentThemeId, versionId });
  }
}
