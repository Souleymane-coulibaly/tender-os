import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ALLOWED_MODEL_CATALOG } from "../../domain/allowed-model-catalog";
import { AddPricingSnapshotUseCase } from "../../application/use-cases/add-pricing-snapshot.use-case";
import { CreateAiModelUseCase } from "../../application/use-cases/create-ai-model.use-case";
import { DisableAiModelUseCase } from "../../application/use-cases/disable-ai-model.use-case";
import { EnableAiModelUseCase } from "../../application/use-cases/enable-ai-model.use-case";
import { GetAiModelUseCase } from "../../application/use-cases/get-ai-model.use-case";
import { ListAiModelsUseCase } from "../../application/use-cases/list-ai-models.use-case";
import { ListPricingSnapshotsUseCase } from "../../application/use-cases/list-pricing-snapshots.use-case";
import { UpdateAiModelUseCase } from "../../application/use-cases/update-ai-model.use-case";
import { AiBenchmarkErrorFilter } from "./ai-benchmark-error.filter";
import { presentAiModel, presentPricingSnapshot } from "./presenters";
import {
  AddPricingSnapshotBodySchema,
  CreateAiModelBodySchema,
  IdParamSchema,
  ListAiModelsQuerySchema,
  UpdateAiModelBodySchema,
  type AddPricingSnapshotBody,
  type CreateAiModelBody,
  type ListAiModelsQuery,
  type UpdateAiModelBody,
} from "./schemas";

/** Contrôleur du registre des modèles IA (Sprint 5.2 §"Registre des modèles") — reste mince,
 *  aucune règle métier ici (validation du catalogue autorisé, permissions : dans les use cases). */
@Controller("ai-models")
@UseFilters(AiBenchmarkErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AiModelsController {
  constructor(
    private readonly createAiModelUseCase: CreateAiModelUseCase,
    private readonly updateAiModelUseCase: UpdateAiModelUseCase,
    private readonly enableAiModelUseCase: EnableAiModelUseCase,
    private readonly disableAiModelUseCase: DisableAiModelUseCase,
    private readonly listAiModelsUseCase: ListAiModelsUseCase,
    private readonly getAiModelUseCase: GetAiModelUseCase,
    private readonly addPricingSnapshotUseCase: AddPricingSnapshotUseCase,
    private readonly listPricingSnapshotsUseCase: ListPricingSnapshotsUseCase,
  ) {}

  /** Catalogue autorisé (Sprint 5.2 §"Ne proposer aucun champ texte libre permettant d'injecter un
   *  modèle arbitraire") — sert le frontend à peupler un `<select>`, jamais une saisie libre. */
  @Get("allowed-catalog")
  @HttpCode(HttpStatus.OK)
  getAllowedCatalog() {
    return ALLOWED_MODEL_CATALOG;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateAiModelBodySchema)) body: CreateAiModelBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createAiModelUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentAiModel(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListAiModelsQuerySchema)) query: ListAiModelsQuery,
  ) {
    const results = await this.listAiModelsUseCase.execute({ actorRole: membership.role, ...query });
    return results.map(presentAiModel);
  }

  @Get(":modelId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
  ) {
    const result = await this.getAiModelUseCase.execute({ actorRole: membership.role, modelId });
    return presentAiModel(result);
  }

  @Patch(":modelId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
    @Body(new ZodValidationPipe(UpdateAiModelBodySchema)) body: UpdateAiModelBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateAiModelUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      modelId,
      ...body,
      requestId: request.id,
    });
    return presentAiModel(result);
  }

  @Post(":modelId/enable")
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.enableAiModelUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      modelId,
      requestId: request.id,
    });
    return presentAiModel(result);
  }

  @Post(":modelId/disable")
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.disableAiModelUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      modelId,
      requestId: request.id,
    });
    return presentAiModel(result);
  }

  @Get(":modelId/pricing")
  @HttpCode(HttpStatus.OK)
  async listPricing(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
  ) {
    const results = await this.listPricingSnapshotsUseCase.execute({ actorRole: membership.role, modelId });
    return results.map(presentPricingSnapshot);
  }

  @Post(":modelId/pricing")
  @HttpCode(HttpStatus.CREATED)
  async addPricing(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("modelId", new ZodValidationPipe(IdParamSchema)) modelId: string,
    @Body(new ZodValidationPipe(AddPricingSnapshotBodySchema)) body: AddPricingSnapshotBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addPricingSnapshotUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      modelId,
      ...body,
      requestId: request.id,
    });
    return presentPricingSnapshot(result);
  }
}
