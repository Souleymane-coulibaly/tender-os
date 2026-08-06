import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import {
  ArchiveBuyerUseCase,
  CreateBuyerUseCase,
  GetBuyerUseCase,
  ListBuyersUseCase,
  RestoreBuyerUseCase,
  UpdateBuyerUseCase,
} from "../../application/use-cases/buyer.use-cases";
import { presentBuyer } from "./presenters";
import { TendersErrorFilter } from "./tenders-error.filter";
import {
  CreateBuyerBodySchema,
  IdParamSchema,
  ListBuyersQuerySchema,
  UpdateBuyerBodySchema,
  type CreateBuyerBody,
  type ListBuyersQuery,
  type UpdateBuyerBody,
} from "./schemas";

/**
 * V2 Sprint 3 §5/§17 — CRUD Acheteur, organisation-scopé (jamais de rattachement client comme les
 * autres ressources de ce module), réutilise TenderPermission (Create/Read/List/Update/Archive) —
 * aucune permission dédiée : un Buyer n'est pas rattaché à une entreprise candidate.
 */
@Controller("buyers")
@UseFilters(TendersErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class BuyersController {
  constructor(
    private readonly listBuyersUseCase: ListBuyersUseCase,
    private readonly getBuyerUseCase: GetBuyerUseCase,
    private readonly createBuyerUseCase: CreateBuyerUseCase,
    private readonly updateBuyerUseCase: UpdateBuyerUseCase,
    private readonly archiveBuyerUseCase: ArchiveBuyerUseCase,
    private readonly restoreBuyerUseCase: RestoreBuyerUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateBuyerBodySchema)) body: CreateBuyerBody,
  ) {
    const result = await this.createBuyerUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
    });
    return presentBuyer(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListBuyersQuerySchema)) query: ListBuyersQuery,
  ) {
    const buyers = await this.listBuyersUseCase.execute({
      organizationId: membership.organizationId,
      actorRole: membership.role,
      ...query,
    });
    return buyers.map(presentBuyer);
  }

  @Get(":buyerId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("buyerId", new ZodValidationPipe(IdParamSchema)) buyerId: string,
  ) {
    const result = await this.getBuyerUseCase.execute({
      organizationId: membership.organizationId,
      buyerId,
      actorRole: membership.role,
    });
    return presentBuyer(result);
  }

  @Patch(":buyerId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("buyerId", new ZodValidationPipe(IdParamSchema)) buyerId: string,
    @Body(new ZodValidationPipe(UpdateBuyerBodySchema)) body: UpdateBuyerBody,
  ) {
    const result = await this.updateBuyerUseCase.execute({
      organizationId: membership.organizationId,
      buyerId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
    });
    return presentBuyer(result);
  }

  @Post(":buyerId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("buyerId", new ZodValidationPipe(IdParamSchema)) buyerId: string,
  ) {
    const result = await this.archiveBuyerUseCase.execute({
      organizationId: membership.organizationId,
      buyerId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return presentBuyer(result);
  }

  @Post(":buyerId/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("buyerId", new ZodValidationPipe(IdParamSchema)) buyerId: string,
  ) {
    const result = await this.restoreBuyerUseCase.execute({
      organizationId: membership.organizationId,
      buyerId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return presentBuyer(result);
  }
}
