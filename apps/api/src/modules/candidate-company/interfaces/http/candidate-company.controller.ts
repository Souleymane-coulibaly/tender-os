import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddCandidateEstablishmentUseCase } from "../../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../../application/use-cases/create-candidate-company.use-case";
import { ReadCandidateCompanyUseCase } from "../../application/use-cases/read-candidate-company.use-case";
import { ListCandidateCompaniesUseCase } from "../../application/use-cases/list-candidate-companies.use-case";
import { ListCandidateEstablishmentsUseCase } from "../../application/use-cases/list-candidate-establishments.use-case";
import { UpdateCandidateCompanyIdentityUseCase } from "../../application/use-cases/update-candidate-company-identity.use-case";
import { CandidateCompanyErrorFilter } from "./candidate-company-error.filter";
import { presentCandidateCompany, presentCandidateEstablishment, presentPage } from "./presenters";
import {
  AddCandidateEstablishmentBodySchema,
  CreateCandidateCompanyBodySchema,
  IdParamSchema,
  ListCandidateCompaniesQuerySchema,
  UpdateCandidateCompanyBodySchema,
  type AddCandidateEstablishmentBody,
  type CreateCandidateCompanyBody,
  type ListCandidateCompaniesQuery,
  type UpdateCandidateCompanyBody,
} from "./schemas";

/**
 * Contrôleur CandidateCompany (mission TenderOS 2.1-A1 §"API") — namespace dédié
 * `/candidate-companies`, jamais imbriqué sous `/clients/:clientId/...` (mission §"jamais nesté").
 * Reste mince, aucune règle métier, aucun accès Prisma direct. Autorisation
 * organization-isolation-only : le guard d'appartenance à l'organisation suffit, aucune policy de
 * permission dédiée en A1 (`CandidatePermission` explicitement différé).
 */
@Controller("candidate-companies")
@UseFilters(CandidateCompanyErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CandidateCompanyController {
  constructor(
    private readonly createCandidateCompanyUseCase: CreateCandidateCompanyUseCase,
    private readonly readCandidateCompanyUseCase: ReadCandidateCompanyUseCase,
    private readonly listCandidateCompaniesUseCase: ListCandidateCompaniesUseCase,
    private readonly addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase,
    private readonly listCandidateEstablishmentsUseCase: ListCandidateEstablishmentsUseCase,
    private readonly updateCandidateCompanyIdentityUseCase: UpdateCandidateCompanyIdentityUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateCandidateCompanyBodySchema)) body: CreateCandidateCompanyBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createCandidateCompanyUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentCandidateCompany(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListCandidateCompaniesQuerySchema)) query: ListCandidateCompaniesQuery,
  ) {
    const result = await this.listCandidateCompaniesUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      includeArchived: query.includeArchived ?? false,
      cursor: query.cursor,
      limit: query.limit,
    });
    return { ...presentPage(result.items.map(presentCandidateCompany), result.nextCursor), total: result.total };
  }

  @Get(":candidateCompanyId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
  ) {
    const result = await this.readCandidateCompanyUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorRole: membership.role,
    });
    return presentCandidateCompany(result);
  }

  /**
   * Checkpoint TENDEROS-2.1-CCV2-F.2 — mise à jour de l'identité juridique, native CandidateCompany.
   *
   * `PATCH` et non `PUT` : un remplacement complet obligerait l'interface à renvoyer des champs
   * qu'elle n'a pas modifiés, et le moindre champ oublié effacerait silencieusement une donnée.
   *
   * `organizationId` n'est JAMAIS accepté dans le corps (`.strict()` le rejette) : le tenant vient
   * exclusivement du contexte d'appartenance résolu par `OrganizationMembershipGuard`. Un corps
   * portant un `organizationId` étranger ne déplace donc rien — il échoue à la validation.
   */
  @Patch(":candidateCompanyId")
  @HttpCode(HttpStatus.OK)
  async updateIdentity(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Body(new ZodValidationPipe(UpdateCandidateCompanyBodySchema)) body: UpdateCandidateCompanyBody,
    @Req() request: RequestWithId,
  ) {
    const company = await this.updateCandidateCompanyIdentityUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorId: actor.userId,
      actorRole: membership.role,
      patch: body,
      requestId: request.id,
    });
    return presentCandidateCompany(company);
  }

  @Post(":candidateCompanyId/establishments")
  @HttpCode(HttpStatus.CREATED)
  async addEstablishment(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Body(new ZodValidationPipe(AddCandidateEstablishmentBodySchema)) body: AddCandidateEstablishmentBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addCandidateEstablishmentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      candidateCompanyId,
      ...body,
      requestId: request.id,
    });
    return presentCandidateEstablishment(result);
  }

  @Get(":candidateCompanyId/establishments")
  @HttpCode(HttpStatus.OK)
  async listEstablishments(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
  ) {
    const result = await this.listCandidateEstablishmentsUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorRole: membership.role,
    });
    return { items: result.map(presentCandidateEstablishment) };
  }
}
