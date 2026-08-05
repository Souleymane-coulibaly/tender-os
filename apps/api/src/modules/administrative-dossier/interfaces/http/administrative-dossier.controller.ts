import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AttachAdministrativeDocumentRevisionUseCase, CreateAdministrativeDocumentUseCase, GetAdministrativeDocumentUseCase, RejectAdministrativeDocumentUseCase, ValidateAdministrativeDocumentUseCase } from "../../application/use-cases/administrative-document.use-cases";
import { CreateAdministrativeRequirementUseCase, ListAdministrativeRequirementsUseCase, UpdateAdministrativeRequirementUseCase } from "../../application/use-cases/administrative-requirement.use-cases";
import { EnsureAdministrativeDossierUseCase } from "../../application/use-cases/ensure-administrative-dossier.use-case";
import { GetAdministrativeChecklistUseCase } from "../../application/use-cases/get-administrative-checklist.use-case";
import { GetAdministrativeDocumentTypeCatalogUseCase } from "../../application/use-cases/get-administrative-document-type-catalog.use-case";
import { GetAdministrativeDossierUseCase } from "../../application/use-cases/get-administrative-dossier.use-case";
import { GetAdministrativeDossierCapabilitiesUseCase } from "../../application/use-cases/get-administrative-dossier-capabilities.use-case";
import { AdministrativeDossierErrorFilter } from "./administrative-dossier-error.filter";
import {
  AttachAdministrativeDocumentRevisionBodySchema,
  CreateAdministrativeDocumentBodySchema,
  CreateAdministrativeRequirementBodySchema,
  IdParamSchema,
  RejectAdministrativeDocumentBodySchema,
  UpdateAdministrativeRequirementBodySchema,
  ValidateAdministrativeDocumentBodySchema,
  type AttachAdministrativeDocumentRevisionBody,
  type CreateAdministrativeDocumentBody,
  type CreateAdministrativeRequirementBody,
  type RejectAdministrativeDocumentBody,
  type UpdateAdministrativeRequirementBody,
  type ValidateAdministrativeDocumentBody,
} from "./schemas";

/**
 * Sprint 8C Phase 1 — dossier administratif : dossier/capacités, exigences, checklist calculée,
 * pièces et leurs révisions. Les routes `administrative-requirements/:id` et
 * `administrative-documents/:id` n'ont volontairement PAS de `tenderId` dans l'URL — le tenderId
 * est dérivé de la ressource chargée (org-scopée), jamais un second paramètre non vérifié.
 */
@Controller()
@UseFilters(AdministrativeDossierErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AdministrativeDossierController {
  constructor(
    private readonly ensureDossierUseCase: EnsureAdministrativeDossierUseCase,
    private readonly getDossierUseCase: GetAdministrativeDossierUseCase,
    private readonly getCapabilitiesUseCase: GetAdministrativeDossierCapabilitiesUseCase,
    private readonly createRequirementUseCase: CreateAdministrativeRequirementUseCase,
    private readonly updateRequirementUseCase: UpdateAdministrativeRequirementUseCase,
    private readonly listRequirementsUseCase: ListAdministrativeRequirementsUseCase,
    private readonly getChecklistUseCase: GetAdministrativeChecklistUseCase,
    private readonly createDocumentUseCase: CreateAdministrativeDocumentUseCase,
    private readonly getDocumentUseCase: GetAdministrativeDocumentUseCase,
    private readonly attachRevisionUseCase: AttachAdministrativeDocumentRevisionUseCase,
    private readonly validateDocumentUseCase: ValidateAdministrativeDocumentUseCase,
    private readonly rejectDocumentUseCase: RejectAdministrativeDocumentUseCase,
    private readonly getDocumentTypeCatalogUseCase: GetAdministrativeDocumentTypeCatalogUseCase,
  ) {}

  /** Correctif audit Codex — mission §7 "le frontend ne doit pas maintenir une liste divergente
   *  codée en dur" : catalogue statique, non nichée sous `/tenders/:tenderId` (aucun scoping
   *  tenant nécessaire pour de la donnée de référence). */
  @Get("administrative-document-types")
  getDocumentTypeCatalog() {
    return this.getDocumentTypeCatalogUseCase.execute();
  }

  @Get("tenders/:tenderId/administrative-dossier")
  async getDossier(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getDossierUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/administrative-dossier")
  @HttpCode(HttpStatus.OK)
  async ensureDossier(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.ensureDossierUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-dossier/capabilities")
  async capabilities(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getCapabilitiesUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-requirements")
  async listRequirements(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listRequirementsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/administrative-requirements")
  @HttpCode(HttpStatus.CREATED)
  async createRequirement(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateAdministrativeRequirementBodySchema)) body: CreateAdministrativeRequirementBody,
  ) {
    return this.createRequirementUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Patch("administrative-requirements/:id")
  async updateRequirement(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) requirementId: string,
    @Body(new ZodValidationPipe(UpdateAdministrativeRequirementBodySchema)) body: UpdateAdministrativeRequirementBody,
  ) {
    return this.updateRequirementUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, requirementId, ...body });
  }

  @Get("tenders/:tenderId/administrative-checklist")
  async checklist(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getChecklistUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("tenders/:tenderId/administrative-documents")
  @HttpCode(HttpStatus.CREATED)
  async createDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateAdministrativeDocumentBodySchema)) body: CreateAdministrativeDocumentBody,
  ) {
    return this.createDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Get("administrative-documents/:id")
  async getDocument(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string) {
    return this.getDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId });
  }

  @Post("administrative-documents/:id/revisions")
  @HttpCode(HttpStatus.CREATED)
  async attachRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(AttachAdministrativeDocumentRevisionBodySchema)) body: AttachAdministrativeDocumentRevisionBody,
  ) {
    return this.attachRevisionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId, ...body });
  }

  @Post("administrative-documents/:id/validate")
  @HttpCode(HttpStatus.OK)
  async validateDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(ValidateAdministrativeDocumentBodySchema)) body: ValidateAdministrativeDocumentBody,
  ) {
    return this.validateDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId, ...body });
  }

  @Post("administrative-documents/:id/reject")
  @HttpCode(HttpStatus.OK)
  async rejectDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(RejectAdministrativeDocumentBodySchema)) body: RejectAdministrativeDocumentBody,
  ) {
    return this.rejectDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId, ...body });
  }
}
