import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CancelGenerationUseCase } from "../../application/use-cases/cancel-generation.use-case";
import { CompareGenerationVersionsUseCase } from "../../application/use-cases/compare-generation-versions.use-case";
import { EditGenerationUseCase } from "../../application/use-cases/edit-generation.use-case";
import { GetGenerationCapabilitiesUseCase } from "../../application/use-cases/get-generation-capabilities.use-case";
import { GetGenerationUseCase } from "../../application/use-cases/get-generation.use-case";
import { LaunchGenerationUseCase } from "../../application/use-cases/launch-generation.use-case";
import { ListGenerationVersionsUseCase } from "../../application/use-cases/list-generation-versions.use-case";
import { ListTenderGenerationsUseCase } from "../../application/use-cases/list-tender-generations.use-case";
import { RegenerateGenerationUseCase } from "../../application/use-cases/regenerate-generation.use-case";
import { RejectGenerationUseCase } from "../../application/use-cases/reject-generation.use-case";
import { RetryGenerationUseCase } from "../../application/use-cases/retry-generation.use-case";
import { ValidateGenerationUseCase } from "../../application/use-cases/validate-generation.use-case";
import { GenerationErrorFilter } from "./generation-error.filter";
import { presentGeneration, presentGenerationCapability } from "./presenters";
import {
  CompareGenerationsQuerySchema,
  EditGenerationBodySchema,
  IdParamSchema,
  LaunchGenerationBodySchema,
  ListTenderGenerationsQuerySchema,
  RejectGenerationBodySchema,
  type CompareGenerationsQuery,
  type EditGenerationBody,
  type LaunchGenerationBody,
  type ListTenderGenerationsQuery,
  type RejectGenerationBody,
} from "./schemas";

/** Routes de génération — jamais de composition de prompt, de routage, de fallback, de calcul de
 *  coût ni de logique tenant/client ici : tout délégué aux use cases (mission §"Les contrôleurs
 *  doivent rester minces"). */
@Controller()
@UseFilters(GenerationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class GenerationController {
  constructor(
    private readonly launchGenerationUseCase: LaunchGenerationUseCase,
    private readonly retryGenerationUseCase: RetryGenerationUseCase,
    private readonly regenerateGenerationUseCase: RegenerateGenerationUseCase,
    private readonly cancelGenerationUseCase: CancelGenerationUseCase,
    private readonly editGenerationUseCase: EditGenerationUseCase,
    private readonly validateGenerationUseCase: ValidateGenerationUseCase,
    private readonly rejectGenerationUseCase: RejectGenerationUseCase,
    private readonly getGenerationUseCase: GetGenerationUseCase,
    private readonly getGenerationCapabilitiesUseCase: GetGenerationCapabilitiesUseCase,
    private readonly listGenerationVersionsUseCase: ListGenerationVersionsUseCase,
    private readonly listTenderGenerationsUseCase: ListTenderGenerationsUseCase,
    private readonly compareGenerationVersionsUseCase: CompareGenerationVersionsUseCase,
  ) {}

  @Post("tenders/:tenderId/generations")
  @HttpCode(HttpStatus.ACCEPTED)
  async launch(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(LaunchGenerationBodySchema)) body: LaunchGenerationBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.launchGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      taskType: body.taskType as never,
      targetRef: body.targetRef,
      requestId: request.id,
    });
    return presentGeneration(result);
  }

  @Get("tenders/:tenderId/generations")
  async listForTender(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListTenderGenerationsQuerySchema)) query: ListTenderGenerationsQuery,
  ) {
    const result = await this.listTenderGenerationsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      taskType: query.taskType as never,
      limit: query.limit,
      offset: query.offset,
    });
    return { items: result.items.map(presentGeneration), total: result.total };
  }

  @Get("tenders/:tenderId/generation-capabilities")
  async capabilities(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const result = await this.getGenerationCapabilitiesUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
    });
    return { items: result.map(presentGenerationCapability) };
  }

  @Get("generations/compare")
  async compare(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(CompareGenerationsQuerySchema)) query: CompareGenerationsQuery,
  ) {
    const result = await this.compareGenerationVersionsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      fromGenerationId: query.fromId,
      toGenerationId: query.toId,
    });
    return { from: presentGeneration(result.from), to: presentGeneration(result.to) };
  }

  @Get("generations/:generationId")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
  ) {
    const result = await this.getGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
    });
    return presentGeneration(result);
  }

  @Get("generations/:generationId/versions")
  async listVersions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
  ) {
    const result = await this.listGenerationVersionsUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
    });
    return result.map(presentGeneration);
  }

  @Post("generations/:generationId/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.retryGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
      requestId: request.id,
    });
    return presentGeneration(result);
  }

  @Post("generations/:generationId/regenerate")
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.regenerateGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
      requestId: request.id,
    });
    return presentGeneration(result);
  }

  @Post("generations/:generationId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
  ) {
    const result = await this.cancelGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
    });
    return presentGeneration(result);
  }

  @Patch("generations/:generationId/edit")
  @HttpCode(HttpStatus.OK)
  async edit(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
    @Body(new ZodValidationPipe(EditGenerationBodySchema)) body: EditGenerationBody,
  ) {
    const result = await this.editGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
      editedContent: body.editedContent,
      editedStructuredContent: body.editedStructuredContent,
    });
    return presentGeneration(result);
  }

  @Post("generations/:generationId/validate")
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
  ) {
    const result = await this.validateGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
    });
    return presentGeneration(result);
  }

  @Post("generations/:generationId/reject")
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("generationId", new ZodValidationPipe(IdParamSchema)) generationId: string,
    @Body(new ZodValidationPipe(RejectGenerationBodySchema)) body: RejectGenerationBody,
  ) {
    const result = await this.rejectGenerationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      generationId,
      reason: body.reason,
    });
    return presentGeneration(result);
  }
}
