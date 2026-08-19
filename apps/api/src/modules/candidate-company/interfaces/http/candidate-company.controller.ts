import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddCandidateEstablishmentUseCase } from "../../application/use-cases/add-candidate-establishment.use-case";
import { CreateCandidateCompanyUseCase } from "../../application/use-cases/create-candidate-company.use-case";
import { GetCandidateCompanyUseCase } from "../../application/use-cases/get-candidate-company.use-case";
import { ListCandidateCompaniesUseCase } from "../../application/use-cases/list-candidate-companies.use-case";
import { ListCandidateEstablishmentsUseCase } from "../../application/use-cases/list-candidate-establishments.use-case";
import { CandidateCompanyErrorFilter } from "./candidate-company-error.filter";
import { presentCandidateCompany, presentCandidateEstablishment, presentPage } from "./presenters";
import {
  AddCandidateEstablishmentBodySchema,
  CreateCandidateCompanyBodySchema,
  IdParamSchema,
  ListCandidateCompaniesQuerySchema,
  type AddCandidateEstablishmentBody,
  type CreateCandidateCompanyBody,
  type ListCandidateCompaniesQuery,
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
    private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase,
    private readonly listCandidateCompaniesUseCase: ListCandidateCompaniesUseCase,
    private readonly addCandidateEstablishmentUseCase: AddCandidateEstablishmentUseCase,
    private readonly listCandidateEstablishmentsUseCase: ListCandidateEstablishmentsUseCase,
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
    const result = await this.getCandidateCompanyUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
    });
    return presentCandidateCompany(result);
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
    });
    return { items: result.map(presentCandidateEstablishment) };
  }
}
