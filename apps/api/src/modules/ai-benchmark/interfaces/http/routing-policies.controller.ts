import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ActivateRoutingPolicyUseCase } from "../../application/use-cases/activate-routing-policy.use-case";
import { ArchiveRoutingPolicyUseCase } from "../../application/use-cases/archive-routing-policy.use-case";
import { CreateRoutingPolicyUseCase } from "../../application/use-cases/create-routing-policy.use-case";
import { GetRoutingPolicyUseCase } from "../../application/use-cases/get-routing-policy.use-case";
import { ListRoutingPoliciesUseCase } from "../../application/use-cases/list-routing-policies.use-case";
import { AiBenchmarkErrorFilter } from "./ai-benchmark-error.filter";
import { presentRoutingPolicy } from "./presenters";
import { CreateRoutingPolicyBodySchema, IdParamSchema, type CreateRoutingPolicyBody } from "./schemas";

/** Contrôleur des politiques de routage (Sprint 5.2 §"Routing Policy") — reste mince, aucune
 *  logique de versionnement/activation atomique ici (dans les use cases/le repository). */
@Controller("ai-benchmark/routing-policies")
@UseFilters(AiBenchmarkErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class RoutingPoliciesController {
  constructor(
    private readonly createUseCase: CreateRoutingPolicyUseCase,
    private readonly activateUseCase: ActivateRoutingPolicyUseCase,
    private readonly archiveUseCase: ArchiveRoutingPolicyUseCase,
    private readonly listUseCase: ListRoutingPoliciesUseCase,
    private readonly getUseCase: GetRoutingPolicyUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateRoutingPolicyBodySchema)) body: CreateRoutingPolicyBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentRoutingPolicy(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    const results = await this.listUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
    return results.map(presentRoutingPolicy);
  }

  @Get(":policyId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("policyId", new ZodValidationPipe(IdParamSchema)) policyId: string,
  ) {
    const result = await this.getUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, policyId });
    return presentRoutingPolicy(result);
  }

  @Post(":policyId/activate")
  @HttpCode(HttpStatus.OK)
  async activate(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("policyId", new ZodValidationPipe(IdParamSchema)) policyId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.activateUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      policyId,
      requestId: request.id,
    });
    return presentRoutingPolicy(result);
  }

  @Post(":policyId/archive")
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("policyId", new ZodValidationPipe(IdParamSchema)) policyId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.archiveUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      policyId,
      requestId: request.id,
    });
    return presentRoutingPolicy(result);
  }
}
