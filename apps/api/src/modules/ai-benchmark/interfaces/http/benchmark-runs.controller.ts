import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CancelBenchmarkRunUseCase } from "../../application/use-cases/cancel-benchmark-run.use-case";
import { EstimateBenchmarkRunCostUseCase } from "../../application/use-cases/estimate-benchmark-run-cost.use-case";
import { GetBenchmarkRunResultsUseCase } from "../../application/use-cases/get-benchmark-run-results.use-case";
import { GetBenchmarkRunUseCase } from "../../application/use-cases/get-benchmark-run.use-case";
import { LaunchBenchmarkRunUseCase } from "../../application/use-cases/launch-benchmark-run.use-case";
import { ListBenchmarkRunsUseCase } from "../../application/use-cases/list-benchmark-runs.use-case";
import { AiBenchmarkErrorFilter } from "./ai-benchmark-error.filter";
import { presentBenchmarkCaseResult, presentBenchmarkRun, presentBenchmarkRunModelComparison } from "./presenters";
import {
  EstimateBenchmarkRunCostBodySchema,
  IdParamSchema,
  LaunchBenchmarkRunBodySchema,
  type EstimateBenchmarkRunCostBody,
  type LaunchBenchmarkRunBody,
} from "./schemas";

/** Contrôleur des runs de benchmark (Sprint 5.2 §"Exécution du benchmark") — reste mince, aucune
 *  logique d'exécution/agrégation/coût ici (dans les use cases/services applicatifs). */
@Controller("ai-benchmark/runs")
@UseFilters(AiBenchmarkErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class BenchmarkRunsController {
  constructor(
    private readonly estimateCostUseCase: EstimateBenchmarkRunCostUseCase,
    private readonly launchUseCase: LaunchBenchmarkRunUseCase,
    private readonly cancelUseCase: CancelBenchmarkRunUseCase,
    private readonly listUseCase: ListBenchmarkRunsUseCase,
    private readonly getUseCase: GetBenchmarkRunUseCase,
    private readonly getResultsUseCase: GetBenchmarkRunResultsUseCase,
  ) {}

  @Post("estimate")
  @HttpCode(HttpStatus.OK)
  async estimate(
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(EstimateBenchmarkRunCostBodySchema)) body: EstimateBenchmarkRunCostBody,
  ) {
    return this.estimateCostUseCase.execute({ actorRole: membership.role, ...body });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async launch(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(LaunchBenchmarkRunBodySchema)) body: LaunchBenchmarkRunBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.launchUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentBenchmarkRun(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    const results = await this.listUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
    return results.map(presentBenchmarkRun);
  }

  @Get(":runId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("runId", new ZodValidationPipe(IdParamSchema)) runId: string,
  ) {
    const result = await this.getUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, runId });
    return presentBenchmarkRun(result);
  }

  @Get(":runId/results")
  @HttpCode(HttpStatus.OK)
  async getResults(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("runId", new ZodValidationPipe(IdParamSchema)) runId: string,
  ) {
    const result = await this.getResultsUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, runId });
    return {
      comparisons: result.comparisons.map(presentBenchmarkRunModelComparison),
      results: result.results.map(presentBenchmarkCaseResult),
    };
  }

  @Post(":runId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("runId", new ZodValidationPipe(IdParamSchema)) runId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.cancelUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      runId,
      requestId: request.id,
    });
    return presentBenchmarkRun(result);
  }
}
