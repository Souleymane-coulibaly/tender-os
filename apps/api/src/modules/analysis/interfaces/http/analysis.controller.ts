import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { CancelAnalysisUseCase } from "../../application/use-cases/cancel-analysis.use-case";
import { GetAnalysisCapabilitiesUseCase } from "../../application/use-cases/get-analysis-capabilities.use-case";
import { GetAnalysisUseCase } from "../../application/use-cases/get-analysis.use-case";
import { GetTenderBusinessAnalysisUseCase } from "../../application/use-cases/get-tender-business-analysis.use-case";
import { ListTenderAnalysesUseCase } from "../../application/use-cases/list-tender-analyses.use-case";
import { ListTenderClausesUseCase } from "../../application/use-cases/list-tender-clauses.use-case";
import { ListTenderCriteriaUseCase } from "../../application/use-cases/list-tender-criteria.use-case";
import { ListTenderDeadlinesUseCase } from "../../application/use-cases/list-tender-deadlines.use-case";
import { ListTenderQuestionsUseCase } from "../../application/use-cases/list-tender-questions.use-case";
import { ListTenderRequirementsUseCase } from "../../application/use-cases/list-tender-requirements.use-case";
import { ListTenderAnalysisSummaryRevisionsUseCase } from "../../application/use-cases/list-tender-analysis-summary-revisions.use-case";
import { ListTenderRisksUseCase } from "../../application/use-cases/list-tender-risks.use-case";
import { MapAnalysisFindingsToAiSuggestionsUseCase } from "../../application/use-cases/map-analysis-findings-to-ai-suggestions.use-case";
import { ReviseTenderAnalysisSummaryUseCase } from "../../application/use-cases/revise-tender-analysis-summary.use-case";
import { RetryAnalysisUseCase } from "../../application/use-cases/retry-analysis.use-case";
import { StartDocumentAnalysisUseCase } from "../../application/use-cases/start-document-analysis.use-case";
import { StartTenderAnalysisUseCase } from "../../application/use-cases/start-tender-analysis.use-case";
import { AnalysisErrorFilter } from "./analysis-error.filter";
import { presentAnalysisJob } from "./presenters";
import {
  BusinessAnalysisListQuerySchema,
  IdParamSchema,
  MapSuggestionsQuerySchema,
  ReviseTenderAnalysisSummaryBodySchema,
  type BusinessAnalysisListQuery,
  type MapSuggestionsQuery,
  type ReviseTenderAnalysisSummaryBody,
} from "./schemas";

/** Socle technique minimal (mission Sprint 4.1 §"API HTTP minimale") — jamais d'UI complète, jamais
 *  de lecture du contenu du corpus analysé ni de la réponse brute du provider. Deux routes de
 *  déclenchement imbriquées sous /tenders/:tenderId (même motif que DCE/Extraction — cohérence
 *  d'organisation déjà établie), trois routes de lecture/relance/annulation adressées directement
 *  par `analysisId` (l'organisation est résolue par le membership, jamais par l'URL). */
@Controller()
@UseFilters(AnalysisErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AnalysisController {
  constructor(
    private readonly startTenderAnalysisUseCase: StartTenderAnalysisUseCase,
    private readonly startDocumentAnalysisUseCase: StartDocumentAnalysisUseCase,
    private readonly getAnalysisUseCase: GetAnalysisUseCase,
    private readonly getAnalysisCapabilitiesUseCase: GetAnalysisCapabilitiesUseCase,
    private readonly retryAnalysisUseCase: RetryAnalysisUseCase,
    private readonly cancelAnalysisUseCase: CancelAnalysisUseCase,
    private readonly listTenderAnalysesUseCase: ListTenderAnalysesUseCase,
    private readonly getTenderBusinessAnalysisUseCase: GetTenderBusinessAnalysisUseCase,
    private readonly listTenderDeadlinesUseCase: ListTenderDeadlinesUseCase,
    private readonly listTenderCriteriaUseCase: ListTenderCriteriaUseCase,
    private readonly listTenderClausesUseCase: ListTenderClausesUseCase,
    private readonly listTenderRequirementsUseCase: ListTenderRequirementsUseCase,
    private readonly listTenderRisksUseCase: ListTenderRisksUseCase,
    private readonly listTenderQuestionsUseCase: ListTenderQuestionsUseCase,
    private readonly mapAnalysisFindingsToAiSuggestionsUseCase: MapAnalysisFindingsToAiSuggestionsUseCase,
    private readonly reviseTenderAnalysisSummaryUseCase: ReviseTenderAnalysisSummaryUseCase,
    private readonly listTenderAnalysisSummaryRevisionsUseCase: ListTenderAnalysisSummaryRevisionsUseCase,
  ) {}

  @Post("tenders/:tenderId/analyses")
  @HttpCode(HttpStatus.ACCEPTED)
  async startTenderAnalysis(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.startTenderAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Post("tenders/:tenderId/documents/:documentId/analyses")
  @HttpCode(HttpStatus.ACCEPTED)
  async startDocumentAnalysis(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.startDocumentAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Get("tenders/:tenderId/analysis-capabilities")
  @HttpCode(HttpStatus.OK)
  async capabilities(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    const result = await this.getAnalysisCapabilitiesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return { items: result };
  }

  @Get("analyses/:analysisId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
  ) {
    const result = await this.getAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorRole: membership.role,
    });
    return presentAnalysisJob(result);
  }

  @Post("analyses/:analysisId/retry")
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.retryAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  @Post("analyses/:analysisId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("analysisId", new ZodValidationPipe(IdParamSchema)) analysisId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.cancelAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      jobId: analysisId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentAnalysisJob(result);
  }

  // Lectures métier Sprint 4.2 — nichées sous /tenders/:tenderId/analysis(...) plutôt que sur des
  // segments plats (/tenders/:tenderId/risks, /criteria) : ces chemins existent déjà dans le module
  // Tenders pour les entités utilisateur TenderRisk/TenderAwardCriterion (Sprint 2/3), qui ont un
  // cycle de vie totalement différent des findings IA — jamais casser ce contrat public existant
  // (mission §"Ne casse aucun contrat public existant").

  @Get("tenders/:tenderId/analyses")
  @HttpCode(HttpStatus.OK)
  async listTenderAnalyses(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderAnalysesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis")
  @HttpCode(HttpStatus.OK)
  async getTenderBusinessAnalysis(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getTenderBusinessAnalysisUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
    });
  }

  @Get("tenders/:tenderId/analysis/deadlines")
  @HttpCode(HttpStatus.OK)
  async listTenderDeadlines(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderDeadlinesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis/criteria")
  @HttpCode(HttpStatus.OK)
  async listTenderCriteria(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderCriteriaUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis/clauses")
  @HttpCode(HttpStatus.OK)
  async listTenderClauses(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderClausesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis/requirements")
  @HttpCode(HttpStatus.OK)
  async listTenderRequirements(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderRequirementsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis/risks")
  @HttpCode(HttpStatus.OK)
  async listTenderRisks(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderRisksUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get("tenders/:tenderId/analysis/questions")
  @HttpCode(HttpStatus.OK)
  async listTenderQuestions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(BusinessAnalysisListQuerySchema)) query: BusinessAnalysisListQuery,
  ) {
    return this.listTenderQuestionsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorRole: membership.role,
      actorId: actor.userId,
      analysisVersion: query.analysisVersion,
      limit: query.limit,
      offset: query.offset,
    });
  }

  // V2 Sprint 4 §9-12 — déclenche le mapping Finding → AiSuggestion (jamais automatique, toujours
  // une action explicite de l'utilisateur) : crée des suggestions PENDING, n'écrit jamais
  // directement de donnée métier (voir `ai-suggestion-bridge` pour l'application ultérieure).
  @Post("tenders/:tenderId/analysis/map-suggestions")
  @HttpCode(HttpStatus.OK)
  async mapSuggestions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(MapSuggestionsQuerySchema)) query: MapSuggestionsQuery,
    @Req() request: RequestWithId,
  ) {
    return this.mapAnalysisFindingsToAiSuggestionsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      analysisVersion: query.analysisVersion,
      requestId: request.id,
    });
  }

  // V2 Sprint 4 — révision utilisateur de la synthèse IA : l'original reste intact et consultable
  // via GET .../analysis (ci-dessus), cette révision s'ajoute comme une nouvelle ligne append-only.
  @Post("tenders/:tenderId/analysis/revisions")
  @HttpCode(HttpStatus.CREATED)
  async reviseSummary(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(ReviseTenderAnalysisSummaryBodySchema)) body: ReviseTenderAnalysisSummaryBody,
    @Req() request: RequestWithId,
  ) {
    return this.reviseTenderAnalysisSummaryUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
  }

  @Get("tenders/:tenderId/analysis/revisions")
  @HttpCode(HttpStatus.OK)
  async listSummaryRevisions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.listTenderAnalysisSummaryRevisionsUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
  }
}
