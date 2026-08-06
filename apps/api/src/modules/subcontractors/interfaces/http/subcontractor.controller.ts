import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import {
  ArchiveSubcontractorCertificationUseCase,
  ArchiveSubcontractorInsuranceUseCase,
  ArchiveSubcontractorReferenceUseCase,
  AttachSubcontractorProfileDocumentUseCase,
  CreateSubcontractorCertificationUseCase,
  CreateSubcontractorInsuranceUseCase,
  CreateSubcontractorReferenceUseCase,
  ListSubcontractorCertificationsUseCase,
  ListSubcontractorInsurancesUseCase,
  ListSubcontractorProfileDocumentsUseCase,
  ListSubcontractorReferencesUseCase,
} from "../../application/use-cases/subcontractor-satellite.use-cases";
import {
  ArchiveSubcontractorProfileUseCase,
  CreateSubcontractorProfileUseCase,
  GetSubcontractorProfileUseCase,
  ListSubcontractorProfilesUseCase,
  RestoreSubcontractorProfileUseCase,
  UpdateSubcontractorProfileUseCase,
} from "../../application/use-cases/subcontractor-profile.use-cases";
import { SubcontractorErrorFilter } from "./subcontractor-error.filter";
import {
  AttachSubcontractorProfileDocumentBodySchema,
  CreateSubcontractorCertificationBodySchema,
  CreateSubcontractorInsuranceBodySchema,
  CreateSubcontractorProfileBodySchema,
  CreateSubcontractorReferenceBodySchema,
  IdParamSchema,
  ListSubcontractorProfilesQuerySchema,
  UpdateSubcontractorProfileBodySchema,
  type AttachSubcontractorProfileDocumentBody,
  type CreateSubcontractorCertificationBody,
  type CreateSubcontractorInsuranceBody,
  type CreateSubcontractorProfileBody,
  type CreateSubcontractorReferenceBody,
  type ListSubcontractorProfilesQuery,
  type UpdateSubcontractorProfileBody,
} from "./schemas";

/**
 * Mission V2 Sprint 2 §6/§9 — répertoire ORGANISATIONNEL de sous-traitants, jamais scopé à un
 * ClientAccount ni à un Tender (hors périmètre ce sprint : aucune sélection/lot/montant).
 */
@Controller("subcontractor-profiles")
@UseFilters(SubcontractorErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class SubcontractorController {
  constructor(
    private readonly listProfilesUseCase: ListSubcontractorProfilesUseCase,
    private readonly getProfileUseCase: GetSubcontractorProfileUseCase,
    private readonly createProfileUseCase: CreateSubcontractorProfileUseCase,
    private readonly updateProfileUseCase: UpdateSubcontractorProfileUseCase,
    private readonly archiveProfileUseCase: ArchiveSubcontractorProfileUseCase,
    private readonly restoreProfileUseCase: RestoreSubcontractorProfileUseCase,
    private readonly listReferencesUseCase: ListSubcontractorReferencesUseCase,
    private readonly createReferenceUseCase: CreateSubcontractorReferenceUseCase,
    private readonly archiveReferenceUseCase: ArchiveSubcontractorReferenceUseCase,
    private readonly listCertificationsUseCase: ListSubcontractorCertificationsUseCase,
    private readonly createCertificationUseCase: CreateSubcontractorCertificationUseCase,
    private readonly archiveCertificationUseCase: ArchiveSubcontractorCertificationUseCase,
    private readonly listInsurancesUseCase: ListSubcontractorInsurancesUseCase,
    private readonly createInsuranceUseCase: CreateSubcontractorInsuranceUseCase,
    private readonly archiveInsuranceUseCase: ArchiveSubcontractorInsuranceUseCase,
    private readonly listDocumentsUseCase: ListSubcontractorProfileDocumentsUseCase,
    private readonly attachDocumentUseCase: AttachSubcontractorProfileDocumentUseCase,
  ) {}

  @Get()
  async list(@CurrentMembershipContext() membership: MembershipContext, @Query(new ZodValidationPipe(ListSubcontractorProfilesQuerySchema)) query: ListSubcontractorProfilesQuery) {
    return this.listProfilesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, ...query });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateSubcontractorProfileBodySchema)) body: CreateSubcontractorProfileBody,
  ) {
    return this.createProfileUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Get(":id")
  async get(@CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.getProfileUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorRole: membership.role });
  }

  @Patch(":id")
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateSubcontractorProfileBodySchema)) body: UpdateSubcontractorProfileBody,
  ) {
    return this.updateProfileUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  async archive(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.archiveProfileUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restore(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.restoreProfileUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":id/references")
  async listReferences(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.listReferencesUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/references")
  @HttpCode(HttpStatus.CREATED)
  async createReference(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateSubcontractorReferenceBodySchema)) body: CreateSubcontractorReferenceBody,
  ) {
    return this.createReferenceUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Delete(":id/references/:referenceId")
  @HttpCode(HttpStatus.OK)
  async archiveReference(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("referenceId", new ZodValidationPipe(IdParamSchema)) referenceId: string,
  ) {
    await this.archiveReferenceUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, referenceId, actorId: actor.userId, actorRole: membership.role });
    return { success: true };
  }

  @Get(":id/certifications")
  async listCertifications(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.listCertificationsUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/certifications")
  @HttpCode(HttpStatus.CREATED)
  async createCertification(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateSubcontractorCertificationBodySchema)) body: CreateSubcontractorCertificationBody,
  ) {
    return this.createCertificationUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Delete(":id/certifications/:certificationId")
  @HttpCode(HttpStatus.OK)
  async archiveCertification(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("certificationId", new ZodValidationPipe(IdParamSchema)) certificationId: string,
  ) {
    await this.archiveCertificationUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, certificationId, actorId: actor.userId, actorRole: membership.role });
    return { success: true };
  }

  @Get(":id/insurances")
  async listInsurances(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.listInsurancesUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/insurances")
  @HttpCode(HttpStatus.CREATED)
  async createInsurance(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateSubcontractorInsuranceBodySchema)) body: CreateSubcontractorInsuranceBody,
  ) {
    return this.createInsuranceUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Delete(":id/insurances/:insuranceId")
  @HttpCode(HttpStatus.OK)
  async archiveInsurance(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("insuranceId", new ZodValidationPipe(IdParamSchema)) insuranceId: string,
  ) {
    await this.archiveInsuranceUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, insuranceId, actorId: actor.userId, actorRole: membership.role });
    return { success: true };
  }

  @Get(":id/documents")
  async listDocuments(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.listDocumentsUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":id/documents")
  @HttpCode(HttpStatus.CREATED)
  async attachDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(AttachSubcontractorProfileDocumentBodySchema)) body: AttachSubcontractorProfileDocumentBody,
  ) {
    return this.attachDocumentUseCase.execute({ organizationId: membership.organizationId, subcontractorProfileId: id, actorId: actor.userId, actorRole: membership.role, ...body });
  }
}
