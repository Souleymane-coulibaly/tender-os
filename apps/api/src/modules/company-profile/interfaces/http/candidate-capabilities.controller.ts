import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import {
  ArchiveCandidateCapabilityUseCase,
  CandidateCapabilityFamily,
  CreateCandidateCapabilityUseCase,
  ListCandidateCapabilitiesUseCase,
  UpdateCandidateCapabilityUseCase,
} from "../../application/use-cases/candidate-capability.use-cases";
import { CandidateCapabilityErrorFilter } from "./candidate-capability-error.filter";
import { presentCandidateCapability } from "./candidate-capability.presenters";
import {
  CreateCompanyCertificationBodySchema,
  CreateCompanyHumanResourceBodySchema,
  CreateCompanyInsuranceBodySchema,
  CreateCompanyMaterialResourceBodySchema,
  CreateCompanyReferenceBodySchema,
  CreateCompanyRepresentativeBodySchema,
  IdParamSchema,
  UpdateCompanyCertificationBodySchema,
  UpdateCompanyHumanResourceBodySchema,
  UpdateCompanyInsuranceBodySchema,
  UpdateCompanyMaterialResourceBodySchema,
  UpdateCompanyReferenceBodySchema,
  UpdateCompanyRepresentativeBodySchema,
} from "./schemas";

/**
 * Checkpoint TENDEROS-2.1-CCV2-C — surface métier officielle des capacités de l'entreprise
 * candidate. Vit dans `company-profile` parce que ce module possède DÉJÀ les 6 repositories et
 * leurs tables : `CandidateCompanyModule` ne peut pas les importer (cycle réel
 * `CompanyProfile → Documents → Tenders → CandidateCompany`), et les dupliquer créerait exactement
 * la seconde autorité que CCV2 supprime.
 *
 * Les schémas de validation Zod sont ceux DÉJÀ écrits pour le chemin Legacy : mêmes tables, mêmes
 * champs, mêmes règles métier — jamais un second jeu de règles qui pourrait diverger.
 *
 * BANKING VOLONTAIREMENT ABSENT (mission §24) : aucune route `bank-accounts` ici. Le banking arrive
 * en CCV2-C.1, derrière `CandidatePermission.ReadBanking`/`ManageBanking`.
 *
 * `DELETE` réalise un ARCHIVAGE (`status = ARCHIVED`), jamais une suppression physique — c'est la
 * règle du domaine, écrite dans le schéma Prisma : une capacité déjà citée par un dossier de
 * réponse ne doit jamais disparaître sous lui.
 */
@Controller("candidate-companies/:candidateCompanyId")
@UseFilters(CandidateCapabilityErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CandidateCapabilitiesController {
  constructor(
    private readonly listUseCase: ListCandidateCapabilitiesUseCase,
    private readonly createUseCase: CreateCandidateCapabilityUseCase,
    private readonly updateUseCase: UpdateCandidateCapabilityUseCase,
    private readonly archiveUseCase: ArchiveCandidateCapabilityUseCase,
  ) {}

  private async list(membership: MembershipContext, candidateCompanyId: string, family: CandidateCapabilityFamily) {
    const items = await this.listUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorRole: membership.role,
      family,
    });
    return { items: items.map(presentCandidateCapability) };
  }

  private async create(
    actor: AuthenticatedActor,
    membership: MembershipContext,
    candidateCompanyId: string,
    family: CandidateCapabilityFamily,
    attributes: Record<string, unknown>,
  ) {
    const created = await this.createUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorId: actor.userId,
      actorRole: membership.role,
      family,
      attributes,
    });
    return presentCandidateCapability(created);
  }

  private async update(
    actor: AuthenticatedActor,
    membership: MembershipContext,
    candidateCompanyId: string,
    capabilityId: string,
    family: CandidateCapabilityFamily,
    attributes: Record<string, unknown>,
  ) {
    const updated = await this.updateUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      capabilityId,
      actorId: actor.userId,
      actorRole: membership.role,
      family,
      attributes,
    });
    return presentCandidateCapability(updated);
  }

  private async archive(
    actor: AuthenticatedActor,
    membership: MembershipContext,
    candidateCompanyId: string,
    capabilityId: string,
    family: CandidateCapabilityFamily,
  ) {
    const archived = await this.archiveUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      capabilityId,
      actorId: actor.userId,
      actorRole: membership.role,
      family,
    });
    return presentCandidateCapability(archived);
  }

  // ---------------------------------------------------------------- representatives
  @Get("representatives")
  @HttpCode(HttpStatus.OK)
  listRepresentatives(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.Representatives);
  }

  @Post("representatives")
  @HttpCode(HttpStatus.CREATED)
  createRepresentative(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyRepresentativeBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.Representatives, body);
  }

  @Patch("representatives/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateRepresentative(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyRepresentativeBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.Representatives, body);
  }

  @Delete("representatives/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveRepresentative(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.Representatives);
  }

  // ---------------------------------------------------------------- insurances
  @Get("insurances")
  @HttpCode(HttpStatus.OK)
  listInsurances(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.Insurances);
  }

  @Post("insurances")
  @HttpCode(HttpStatus.CREATED)
  createInsurance(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyInsuranceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.Insurances, body);
  }

  @Patch("insurances/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateInsurance(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyInsuranceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.Insurances, body);
  }

  @Delete("insurances/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveInsurance(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.Insurances);
  }

  // ---------------------------------------------------------------- certifications
  @Get("certifications")
  @HttpCode(HttpStatus.OK)
  listCertifications(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.Certifications);
  }

  @Post("certifications")
  @HttpCode(HttpStatus.CREATED)
  createCertification(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyCertificationBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.Certifications, body);
  }

  @Patch("certifications/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateCertification(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyCertificationBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.Certifications, body);
  }

  @Delete("certifications/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveCertification(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.Certifications);
  }

  // ---------------------------------------------------------------- references
  @Get("references")
  @HttpCode(HttpStatus.OK)
  listReferences(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.References);
  }

  @Post("references")
  @HttpCode(HttpStatus.CREATED)
  createReference(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyReferenceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.References, body);
  }

  @Patch("references/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateReference(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyReferenceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.References, body);
  }

  @Delete("references/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveReference(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.References);
  }

  // ---------------------------------------------------------------- human resources
  @Get("human-resources")
  @HttpCode(HttpStatus.OK)
  listHumanResources(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.HumanResources);
  }

  @Post("human-resources")
  @HttpCode(HttpStatus.CREATED)
  createHumanResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyHumanResourceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.HumanResources, body);
  }

  @Patch("human-resources/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateHumanResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyHumanResourceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.HumanResources, body);
  }

  @Delete("human-resources/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveHumanResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.HumanResources);
  }

  // ---------------------------------------------------------------- material resources
  @Get("material-resources")
  @HttpCode(HttpStatus.OK)
  listMaterialResources(@CurrentMembershipContext() m: MembershipContext, @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string) {
    return this.list(m, id, CandidateCapabilityFamily.MaterialResources);
  }

  @Post("material-resources")
  @HttpCode(HttpStatus.CREATED)
  createMaterialResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Body(new ZodValidationPipe(CreateCompanyMaterialResourceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.create(a, m, id, CandidateCapabilityFamily.MaterialResources, body);
  }

  @Patch("material-resources/:capabilityId")
  @HttpCode(HttpStatus.OK)
  updateMaterialResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
    @Body(new ZodValidationPipe(UpdateCompanyMaterialResourceBodySchema)) body: Record<string, unknown>,
  ) {
    return this.update(a, m, id, capabilityId, CandidateCapabilityFamily.MaterialResources, body);
  }

  @Delete("material-resources/:capabilityId")
  @HttpCode(HttpStatus.OK)
  archiveMaterialResource(
    @CurrentActor() a: AuthenticatedActor,
    @CurrentMembershipContext() m: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) id: string,
    @Param("capabilityId", new ZodValidationPipe(IdParamSchema)) capabilityId: string,
  ) {
    return this.archive(a, m, id, capabilityId, CandidateCapabilityFamily.MaterialResources);
  }
}
