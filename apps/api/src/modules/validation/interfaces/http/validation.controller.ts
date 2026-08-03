import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { ApproveFinalVersionUseCase } from "../../application/use-cases/approve-final-version.use-case";
import { GetReadinessStatusUseCase } from "../../application/use-cases/get-readiness-status.use-case";
import { GetValidationRunUseCase } from "../../application/use-cases/get-validation-run.use-case";
import { ReopenFinalVersionUseCase } from "../../application/use-cases/reopen-final-version.use-case";
import { ReopenValidationIssueUseCase } from "../../application/use-cases/reopen-validation-issue.use-case";
import { ResolveValidationIssueUseCase } from "../../application/use-cases/resolve-validation-issue.use-case";
import { RunFinalValidationUseCase } from "../../application/use-cases/run-final-validation.use-case";
import { ValidationErrorFilter } from "./validation-error.filter";
import {
  ApproveFinalVersionBodySchema,
  IdParamSchema,
  ReopenFinalVersionBodySchema,
  ResolveIssueBodySchema,
  RunFinalValidationBodySchema,
  type ApproveFinalVersionBody,
  type ReopenFinalVersionBody,
  type ResolveIssueBody,
  type RunFinalValidationBody,
} from "./schemas";

@Controller()
@UseFilters(ValidationErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ValidationController {
  constructor(
    private readonly runFinalValidationUseCase: RunFinalValidationUseCase,
    private readonly getValidationRunUseCase: GetValidationRunUseCase,
    private readonly resolveValidationIssueUseCase: ResolveValidationIssueUseCase,
    private readonly reopenValidationIssueUseCase: ReopenValidationIssueUseCase,
    private readonly approveFinalVersionUseCase: ApproveFinalVersionUseCase,
    private readonly reopenFinalVersionUseCase: ReopenFinalVersionUseCase,
    private readonly getReadinessStatusUseCase: GetReadinessStatusUseCase,
  ) {}

  @Post("tenders/:tenderId/validation/run")
  @HttpCode(HttpStatus.CREATED)
  async run(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(RunFinalValidationBodySchema)) body: RunFinalValidationBody,
  ) {
    return this.runFinalValidationUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      exportJobId: body.exportJobId,
    });
  }

  @Get("tenders/:tenderId/validation")
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getValidationRunUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager) — correctif d'une collision de route réelle :
  // `TendersController` enregistre déjà `GET tenders/:tenderId/readiness` (score de complétude
  // générique, Sprint 0/2) ; Nest/Express ne résolvant que la PREMIÈRE route enregistrée pour un
  // chemin identique (ordre d'import de `app.module.ts`, `TendersModule` avant `ValidationModule`),
  // cette route-ci n'était JAMAIS atteinte — l'écran Validation recevait silencieusement la forme
  // de réponse de Tenders (`score`/`breakdown`) au lieu de `{status, latestValidationRunId,
  // activeApprovalId}`, très probablement la cause racine réelle du bug #5 ("reste bloqué sur 'en
  // attente d'approbation' après signature"). Chemin renommé sous le préfixe `/validation` déjà
  // utilisé par la route sœur ci-dessus, jamais un chemin partagé avec un autre module.
  @Get("tenders/:tenderId/validation/readiness")
  async readiness(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getReadinessStatusUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("validation/issues/:issueId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolve(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("issueId", new ZodValidationPipe(IdParamSchema)) issueId: string,
    @Body(new ZodValidationPipe(ResolveIssueBodySchema)) body: ResolveIssueBody,
  ) {
    return this.resolveValidationIssueUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      issueId,
      resolutionNote: body.resolutionNote,
    });
  }

  @Post("validation/issues/:issueId/reopen")
  @HttpCode(HttpStatus.OK)
  async reopen(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("issueId", new ZodValidationPipe(IdParamSchema)) issueId: string,
    @Body(new ZodValidationPipe(ResolveIssueBodySchema)) body: ResolveIssueBody,
  ) {
    return this.reopenValidationIssueUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      issueId,
      resolutionNote: body.resolutionNote,
    });
  }

  @Post("tenders/:tenderId/final-approval")
  @HttpCode(HttpStatus.CREATED)
  async approve(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ApproveFinalVersionBodySchema)) body: ApproveFinalVersionBody,
  ) {
    return this.approveFinalVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      validationRunId: body.validationRunId,
      comment: body.comment,
    });
  }

  @Post("tenders/:tenderId/reopen")
  @HttpCode(HttpStatus.OK)
  async reopenApproval(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ReopenFinalVersionBodySchema)) body: ReopenFinalVersionBody,
  ) {
    return this.reopenFinalVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      reason: body.reason,
    });
  }
}
