import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CreateTenderLotUseCase } from "../../application/use-cases/create-tender-lot.use-case";
import { DeleteTenderLotUseCase, UpdateTenderLotUseCase } from "../../application/use-cases/update-tender-lot.use-case";
import { GetTenderLotUseCase } from "../../application/use-cases/get-tender-lot.use-case";
import { ListTenderLotsUseCase } from "../../application/use-cases/list-tender-lots.use-case";
import { ReorderTenderLotsUseCase } from "../../application/use-cases/reorder-tender-lots.use-case";
import { RestoreTenderLotUseCase } from "../../application/use-cases/restore-tender-lot.use-case";
import { presentTenderLot } from "./presenters";
import { TendersErrorFilter } from "./tenders-error.filter";
import {
  CreateTenderLotBodySchema,
  IdParamSchema,
  ReorderTenderLotsBodySchema,
  RestoreTenderLotBodySchema,
  UpdateTenderLotBodySchema,
  type CreateTenderLotBody,
  type ReorderTenderLotsBody,
  type RestoreTenderLotBody,
  type UpdateTenderLotBody,
} from "./schemas";

/**
 * AUDIT-008 : extrait du TendersController (devenu volumineux) dans son propre contrôleur —
 * mêmes routes, mêmes permissions, même API publique, aucun comportement modifié. Le préfixe de
 * classe porte directement `:tenderId` (NestJS accepte des paramètres dans le préfixe d'un
 * contrôleur), chaque méthode ne déclare donc plus que son segment propre.
 */
@Controller("tenders/:tenderId/lots")
@UseFilters(TendersErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderLotsController {
  constructor(
    private readonly createTenderLotUseCase: CreateTenderLotUseCase,
    private readonly updateTenderLotUseCase: UpdateTenderLotUseCase,
    private readonly deleteTenderLotUseCase: DeleteTenderLotUseCase,
    private readonly listTenderLotsUseCase: ListTenderLotsUseCase,
    private readonly getTenderLotUseCase: GetTenderLotUseCase,
    private readonly restoreTenderLotUseCase: RestoreTenderLotUseCase,
    private readonly reorderTenderLotsUseCase: ReorderTenderLotsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateTenderLotBodySchema)) body: CreateTenderLotBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentTenderLot(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const lots = await this.listTenderLotsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
    });
    return lots.map(presentTenderLot);
  }

  // Déclarée avant les routes paramétrées par :lotId (même verbe, même profondeur) — sinon
  // NestJS/Express interpréterait "reorder" comme une valeur de :lotId (conception Lots §F).
  @Patch("reorder")
  @HttpCode(HttpStatus.OK)
  async reorder(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ReorderTenderLotsBodySchema)) body: ReorderTenderLotsBody,
    @Req() request: RequestWithId,
  ) {
    const lots = await this.reorderTenderLotsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      orderedLotIds: body.lotIds,
      requestId: request.id,
    });
    return lots.map(presentTenderLot);
  }

  @Get(":lotId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
  ) {
    const result = await this.getTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorRole: membership.role,
    });
    return presentTenderLot(result);
  }

  @Patch(":lotId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
    @Body(new ZodValidationPipe(UpdateTenderLotBodySchema)) body: UpdateTenderLotBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentTenderLot(result);
  }

  @Delete(":lotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
  }

  @Post(":lotId/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("lotId", new ZodValidationPipe(IdParamSchema)) lotId: string,
    @Body(new ZodValidationPipe(RestoreTenderLotBodySchema)) _body: RestoreTenderLotBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.restoreTenderLotUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      lotId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentTenderLot(result);
  }
}
