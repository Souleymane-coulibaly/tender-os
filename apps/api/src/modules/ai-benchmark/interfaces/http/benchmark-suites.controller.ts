import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddBenchmarkCaseUseCase } from "../../application/use-cases/add-benchmark-case.use-case";
import { CreateBenchmarkSuiteUseCase } from "../../application/use-cases/create-benchmark-suite.use-case";
import { CreateNextBenchmarkSuiteVersionUseCase } from "../../application/use-cases/create-next-benchmark-suite-version.use-case";
import { GetBenchmarkSuiteUseCase } from "../../application/use-cases/get-benchmark-suite.use-case";
import { ListBenchmarkSuitesUseCase } from "../../application/use-cases/list-benchmark-suites.use-case";
import { PublishBenchmarkSuiteUseCase } from "../../application/use-cases/publish-benchmark-suite.use-case";
import { AiBenchmarkErrorFilter } from "./ai-benchmark-error.filter";
import { presentBenchmarkCase, presentBenchmarkSuite } from "./presenters";
import {
  AddBenchmarkCaseBodySchema,
  CreateBenchmarkSuiteBodySchema,
  IdParamSchema,
  type AddBenchmarkCaseBody,
  type CreateBenchmarkSuiteBody,
} from "./schemas";

/** Contrôleur du corpus de benchmark (Sprint 5.2 §"Corpus de benchmark") — reste mince, aucune
 *  règle métier ici (immutabilité post-publication, non-vacuité : dans les use cases/le domaine). */
@Controller("ai-benchmark/suites")
@UseFilters(AiBenchmarkErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class BenchmarkSuitesController {
  constructor(
    private readonly createBenchmarkSuiteUseCase: CreateBenchmarkSuiteUseCase,
    private readonly createNextBenchmarkSuiteVersionUseCase: CreateNextBenchmarkSuiteVersionUseCase,
    private readonly addBenchmarkCaseUseCase: AddBenchmarkCaseUseCase,
    private readonly publishBenchmarkSuiteUseCase: PublishBenchmarkSuiteUseCase,
    private readonly listBenchmarkSuitesUseCase: ListBenchmarkSuitesUseCase,
    private readonly getBenchmarkSuiteUseCase: GetBenchmarkSuiteUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateBenchmarkSuiteBodySchema)) body: CreateBenchmarkSuiteBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createBenchmarkSuiteUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentBenchmarkSuite(result);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    const results = await this.listBenchmarkSuitesUseCase.execute({ actorRole: membership.role });
    return results.map(presentBenchmarkSuite);
  }

  @Get(":suiteId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("suiteId", new ZodValidationPipe(IdParamSchema)) suiteId: string,
  ) {
    const result = await this.getBenchmarkSuiteUseCase.execute({ actorRole: membership.role, suiteId });
    return { suite: presentBenchmarkSuite(result.suite), cases: result.cases.map(presentBenchmarkCase) };
  }

  @Post(":suiteId/cases")
  @HttpCode(HttpStatus.CREATED)
  async addCase(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("suiteId", new ZodValidationPipe(IdParamSchema)) suiteId: string,
    @Body(new ZodValidationPipe(AddBenchmarkCaseBodySchema)) body: AddBenchmarkCaseBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addBenchmarkCaseUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      suiteId,
      inputVariables: body.inputVariables,
      expectedOutput: body.expectedOutput,
      expectedProvenance: body.expectedProvenance,
      difficulty: body.difficulty,
      language: body.language,
      businessCategory: body.businessCategory,
      requestId: request.id,
    });
    return presentBenchmarkCase(result);
  }

  @Post(":suiteId/publish")
  @HttpCode(HttpStatus.OK)
  async publish(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("suiteId", new ZodValidationPipe(IdParamSchema)) suiteId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.publishBenchmarkSuiteUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      suiteId,
      requestId: request.id,
    });
    return presentBenchmarkSuite(result);
  }

  @Post(":suiteId/new-version")
  @HttpCode(HttpStatus.CREATED)
  async newVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("suiteId", new ZodValidationPipe(IdParamSchema)) suiteId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createNextBenchmarkSuiteVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      suiteId,
      requestId: request.id,
    });
    return presentBenchmarkSuite(result);
  }
}
