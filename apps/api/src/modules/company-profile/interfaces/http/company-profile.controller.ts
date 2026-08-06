import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ArchiveCompanyBankAccountUseCase, CreateCompanyBankAccountUseCase, ListCompanyBankAccountsUseCase, UpdateCompanyBankAccountUseCase } from "../../application/use-cases/company-bank-account.use-cases";
import { CreateCompanyCertificationUseCase, ListCompanyCertificationsUseCase, UpdateCompanyCertificationUseCase } from "../../application/use-cases/company-certification.use-cases";
import { CreateCompanyHumanResourceUseCase, ListCompanyHumanResourcesUseCase, UpdateCompanyHumanResourceUseCase } from "../../application/use-cases/company-human-resource.use-cases";
import { CreateCompanyInsuranceUseCase, ListCompanyInsurancesUseCase, UpdateCompanyInsuranceUseCase } from "../../application/use-cases/company-insurance.use-cases";
import { GetCompanyLegalIdentityUseCase, UpsertCompanyLegalIdentityUseCase } from "../../application/use-cases/company-legal-identity.use-cases";
import { CreateCompanyMaterialResourceUseCase, ListCompanyMaterialResourcesUseCase, UpdateCompanyMaterialResourceUseCase } from "../../application/use-cases/company-material-resource.use-cases";
import { AttachDocumentToCompanyReferenceUseCase, CreateCompanyReferenceUseCase, ListCompanyReferenceDocumentsUseCase, ListCompanyReferencesUseCase, UpdateCompanyReferenceUseCase } from "../../application/use-cases/company-reference.use-cases";
import { CreateCompanyRepresentativeUseCase, ListCompanyRepresentativesUseCase, UpdateCompanyRepresentativeUseCase } from "../../application/use-cases/company-representative.use-cases";
import { AttachDocumentToClientAccountUseCase, ListClientAccountDocumentAssociationsUseCase } from "../../application/use-cases/document-client-account-association.use-cases";
import { GetCompanyProfileUseCase } from "../../application/use-cases/get-company-profile.use-case";
import { CompanyProfileErrorFilter } from "./company-profile-error.filter";
import { maskBankAccountForList } from "./mask-bank-account";
import {
  AttachClientAccountDocumentBodySchema,
  AttachCompanyReferenceDocumentBodySchema,
  CreateCompanyBankAccountBodySchema,
  CreateCompanyCertificationBodySchema,
  CreateCompanyHumanResourceBodySchema,
  CreateCompanyInsuranceBodySchema,
  CreateCompanyMaterialResourceBodySchema,
  CreateCompanyReferenceBodySchema,
  CreateCompanyRepresentativeBodySchema,
  IdParamSchema,
  UpdateCompanyBankAccountBodySchema,
  UpdateCompanyCertificationBodySchema,
  UpdateCompanyHumanResourceBodySchema,
  UpdateCompanyInsuranceBodySchema,
  UpdateCompanyMaterialResourceBodySchema,
  UpdateCompanyReferenceBodySchema,
  UpdateCompanyRepresentativeBodySchema,
  UpsertCompanyLegalIdentityBodySchema,
  type AttachClientAccountDocumentBody,
  type AttachCompanyReferenceDocumentBody,
  type CreateCompanyBankAccountBody,
  type CreateCompanyCertificationBody,
  type CreateCompanyHumanResourceBody,
  type CreateCompanyInsuranceBody,
  type CreateCompanyMaterialResourceBody,
  type CreateCompanyReferenceBody,
  type CreateCompanyRepresentativeBody,
  type UpdateCompanyBankAccountBody,
  type UpdateCompanyCertificationBody,
  type UpdateCompanyHumanResourceBody,
  type UpdateCompanyInsuranceBody,
  type UpdateCompanyMaterialResourceBody,
  type UpdateCompanyReferenceBody,
  type UpdateCompanyRepresentativeBody,
  type UpsertCompanyLegalIdentityBody,
} from "./schemas";

/**
 * Mission V2 Sprint 2 §9/§10 — fiche "Entreprise candidate" : identité légale + satellites
 * progressifs. Routes nichées sous `/clients/:clientId/...`, même préfixe que `ClientPortfolioController`
 * (`:clientId`, pas `:id`, pour rester cohérent avec la convention déjà en place).
 */
@Controller("clients")
@UseFilters(CompanyProfileErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CompanyProfileController {
  constructor(
    private readonly getProfileUseCase: GetCompanyProfileUseCase,
    private readonly getLegalIdentityUseCase: GetCompanyLegalIdentityUseCase,
    private readonly upsertLegalIdentityUseCase: UpsertCompanyLegalIdentityUseCase,
    private readonly listRepresentativesUseCase: ListCompanyRepresentativesUseCase,
    private readonly createRepresentativeUseCase: CreateCompanyRepresentativeUseCase,
    private readonly updateRepresentativeUseCase: UpdateCompanyRepresentativeUseCase,
    private readonly listBankAccountsUseCase: ListCompanyBankAccountsUseCase,
    private readonly createBankAccountUseCase: CreateCompanyBankAccountUseCase,
    private readonly updateBankAccountUseCase: UpdateCompanyBankAccountUseCase,
    private readonly archiveBankAccountUseCase: ArchiveCompanyBankAccountUseCase,
    private readonly listInsurancesUseCase: ListCompanyInsurancesUseCase,
    private readonly createInsuranceUseCase: CreateCompanyInsuranceUseCase,
    private readonly updateInsuranceUseCase: UpdateCompanyInsuranceUseCase,
    private readonly listCertificationsUseCase: ListCompanyCertificationsUseCase,
    private readonly createCertificationUseCase: CreateCompanyCertificationUseCase,
    private readonly updateCertificationUseCase: UpdateCompanyCertificationUseCase,
    private readonly listReferencesUseCase: ListCompanyReferencesUseCase,
    private readonly createReferenceUseCase: CreateCompanyReferenceUseCase,
    private readonly updateReferenceUseCase: UpdateCompanyReferenceUseCase,
    private readonly attachReferenceDocumentUseCase: AttachDocumentToCompanyReferenceUseCase,
    private readonly listReferenceDocumentsUseCase: ListCompanyReferenceDocumentsUseCase,
    private readonly listHumanResourcesUseCase: ListCompanyHumanResourcesUseCase,
    private readonly createHumanResourceUseCase: CreateCompanyHumanResourceUseCase,
    private readonly updateHumanResourceUseCase: UpdateCompanyHumanResourceUseCase,
    private readonly listMaterialResourcesUseCase: ListCompanyMaterialResourcesUseCase,
    private readonly createMaterialResourceUseCase: CreateCompanyMaterialResourceUseCase,
    private readonly updateMaterialResourceUseCase: UpdateCompanyMaterialResourceUseCase,
    private readonly listDocumentAssociationsUseCase: ListClientAccountDocumentAssociationsUseCase,
    private readonly attachDocumentUseCase: AttachDocumentToClientAccountUseCase,
  ) {}

  @Get(":clientId/profile")
  async getProfile(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.getProfileUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":clientId/legal-identity")
  async getLegalIdentity(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.getLegalIdentityUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Patch(":clientId/legal-identity")
  async upsertLegalIdentity(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(UpsertCompanyLegalIdentityBodySchema)) body: UpsertCompanyLegalIdentityBody,
  ) {
    return this.upsertLegalIdentityUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Get(":clientId/representatives")
  async listRepresentatives(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listRepresentativesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/representatives")
  @HttpCode(HttpStatus.CREATED)
  async createRepresentative(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyRepresentativeBodySchema)) body: CreateCompanyRepresentativeBody,
  ) {
    return this.createRepresentativeUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/representatives/:representativeId")
  async updateRepresentative(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("representativeId", new ZodValidationPipe(IdParamSchema)) representativeId: string,
    @Body(new ZodValidationPipe(UpdateCompanyRepresentativeBodySchema)) body: UpdateCompanyRepresentativeBody,
  ) {
    return this.updateRepresentativeUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, representativeId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/bank-accounts")
  async listBankAccounts(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    const accounts = await this.listBankAccountsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
    return accounts.map(maskBankAccountForList);
  }

  @Post(":clientId/bank-accounts")
  @HttpCode(HttpStatus.CREATED)
  async createBankAccount(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyBankAccountBodySchema)) body: CreateCompanyBankAccountBody,
  ) {
    return this.createBankAccountUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/bank-accounts/:bankAccountId")
  async updateBankAccount(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("bankAccountId", new ZodValidationPipe(IdParamSchema)) bankAccountId: string,
    @Body(new ZodValidationPipe(UpdateCompanyBankAccountBodySchema)) body: UpdateCompanyBankAccountBody,
  ) {
    return this.updateBankAccountUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, bankAccountId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Post(":clientId/bank-accounts/:bankAccountId/archive")
  @HttpCode(HttpStatus.OK)
  async archiveBankAccount(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("bankAccountId", new ZodValidationPipe(IdParamSchema)) bankAccountId: string,
  ) {
    return this.archiveBankAccountUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, bankAccountId, actorId: actor.userId, actorRole: membership.role });
  }

  @Get(":clientId/insurances")
  async listInsurances(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listInsurancesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/insurances")
  @HttpCode(HttpStatus.CREATED)
  async createInsurance(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyInsuranceBodySchema)) body: CreateCompanyInsuranceBody,
  ) {
    return this.createInsuranceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/insurances/:insuranceId")
  async updateInsurance(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("insuranceId", new ZodValidationPipe(IdParamSchema)) insuranceId: string,
    @Body(new ZodValidationPipe(UpdateCompanyInsuranceBodySchema)) body: UpdateCompanyInsuranceBody,
  ) {
    return this.updateInsuranceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, insuranceId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/certifications")
  async listCertifications(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listCertificationsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/certifications")
  @HttpCode(HttpStatus.CREATED)
  async createCertification(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyCertificationBodySchema)) body: CreateCompanyCertificationBody,
  ) {
    return this.createCertificationUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/certifications/:certificationId")
  async updateCertification(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("certificationId", new ZodValidationPipe(IdParamSchema)) certificationId: string,
    @Body(new ZodValidationPipe(UpdateCompanyCertificationBodySchema)) body: UpdateCompanyCertificationBody,
  ) {
    return this.updateCertificationUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, certificationId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/references")
  async listReferences(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listReferencesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/references")
  @HttpCode(HttpStatus.CREATED)
  async createReference(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyReferenceBodySchema)) body: CreateCompanyReferenceBody,
  ) {
    return this.createReferenceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/references/:referenceId")
  async updateReference(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("referenceId", new ZodValidationPipe(IdParamSchema)) referenceId: string,
    @Body(new ZodValidationPipe(UpdateCompanyReferenceBodySchema)) body: UpdateCompanyReferenceBody,
  ) {
    return this.updateReferenceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, referenceId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/references/:referenceId/documents")
  async listReferenceDocuments(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("referenceId", new ZodValidationPipe(IdParamSchema)) referenceId: string,
  ) {
    return this.listReferenceDocumentsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, referenceId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/references/:referenceId/documents")
  @HttpCode(HttpStatus.CREATED)
  async attachReferenceDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("referenceId", new ZodValidationPipe(IdParamSchema)) referenceId: string,
    @Body(new ZodValidationPipe(AttachCompanyReferenceDocumentBodySchema)) body: AttachCompanyReferenceDocumentBody,
  ) {
    return this.attachReferenceDocumentUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, referenceId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Get(":clientId/human-resources")
  async listHumanResources(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listHumanResourcesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/human-resources")
  @HttpCode(HttpStatus.CREATED)
  async createHumanResource(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyHumanResourceBodySchema)) body: CreateCompanyHumanResourceBody,
  ) {
    return this.createHumanResourceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/human-resources/:humanResourceId")
  async updateHumanResource(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("humanResourceId", new ZodValidationPipe(IdParamSchema)) humanResourceId: string,
    @Body(new ZodValidationPipe(UpdateCompanyHumanResourceBodySchema)) body: UpdateCompanyHumanResourceBody,
  ) {
    return this.updateHumanResourceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, humanResourceId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/material-resources")
  async listMaterialResources(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listMaterialResourcesUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/material-resources")
  @HttpCode(HttpStatus.CREATED)
  async createMaterialResource(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(CreateCompanyMaterialResourceBodySchema)) body: CreateCompanyMaterialResourceBody,
  ) {
    return this.createMaterialResourceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }

  @Patch(":clientId/material-resources/:materialResourceId")
  async updateMaterialResource(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Param("materialResourceId", new ZodValidationPipe(IdParamSchema)) materialResourceId: string,
    @Body(new ZodValidationPipe(UpdateCompanyMaterialResourceBodySchema)) body: UpdateCompanyMaterialResourceBody,
  ) {
    return this.updateMaterialResourceUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, materialResourceId, actorId: actor.userId, actorRole: membership.role, patch: body });
  }

  @Get(":clientId/documents")
  async listDocuments(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string) {
    return this.listDocumentAssociationsUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":clientId/documents")
  @HttpCode(HttpStatus.CREATED)
  async attachDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("clientId", new ZodValidationPipe(IdParamSchema)) clientId: string,
    @Body(new ZodValidationPipe(AttachClientAccountDocumentBodySchema)) body: AttachClientAccountDocumentBody,
  ) {
    return this.attachDocumentUseCase.execute({ organizationId: membership.organizationId, clientAccountId: clientId, actorId: actor.userId, actorRole: membership.role, ...body });
  }
}
