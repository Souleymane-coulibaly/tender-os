import { randomUUID } from "node:crypto";
import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import { AnalysisJob } from "../domain/analysis-job.aggregate";
import type { AnalysisScope } from "../domain/analysis-scope";
import { AnalysisStatus } from "../domain/analysis-status";
import { AnalysisNotFoundError } from "../domain/errors";
import { AnalysisAttempt } from "../domain/analysis-attempt.entity";
import type { AnalysisAuditLogEntry, AuditLogWriter } from "../application/ports/audit-log-writer";
import type { OutboxEventInput, OutboxWriter } from "../../outbox";
import type { AIProvider, AIProviderRequest, AIProviderResult, AIProviderUsage } from "../application/ports/ai-provider";
import type { AIProviderRegistry } from "../application/ports/ai-provider-registry";
import type { AnalysisAttemptRepository } from "../application/ports/analysis-attempt.repository";
import type { AnalysisDispatchInput, AnalysisDispatcher } from "../application/ports/analysis-dispatcher";
import type {
  AnalysisJobRepository,
  ExclusiveTargetContext,
  FinalizeAttemptOutcome,
  ReservationOutcome,
} from "../application/ports/analysis-job.repository";
import { PROMPT_VERSIONS, PromptKey, type PromptTemplatePort, type PromptVariables, type RenderedPrompt } from "../application/ports/prompt-template.port";
import type { ActiveRoutingDecision, RoutingPolicyResolver } from "../application/ports/routing-policy-resolver";
import type {
  CompleteRoutingDecisionInput,
  CreateRoutingDecisionInput,
  RoutingDecisionWriter,
} from "../application/ports/routing-decision-writer";
import type {
  BusinessAnalysisRepository,
  ClauseFindingRecord,
  CriterionFindingRecord,
  DeadlineFindingRecord,
  DocumentAnalysisRecord,
  ListPage,
  PageResult,
  PersistDocumentAnalysisInput,
  PersistTenderConsolidationInput,
  PrismaTx,
  QuestionFindingRecord,
  RequirementFindingRecord,
  RiskFindingRecord,
  TenderAnalysisSummaryRecord,
} from "../application/ports/business-analysis.repository";
import type {
  AnalysisContentResolver,
  AnalysisSuccessResult,
  PreparedAnalysisRequest,
} from "../application/ports/analysis-content-resolver";
import type {
  CreateTenderAnalysisSummaryRevisionInput,
  TenderAnalysisSummaryRevisionRecord,
  TenderAnalysisSummaryRevisionRepository,
} from "../application/ports/tender-analysis-summary-revision.repository";

export const FIXED_NOW = new Date("2026-07-29T14:00:00Z");

export class FixedClock implements Clock {
  constructor(private value: Date = FIXED_NOW) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class InMemoryAuditLogWriter implements AuditLogWriter {
  readonly entries: AnalysisAuditLogEntry[] = [];
  async record(entry: AnalysisAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

export class FakeOutboxWriter implements OutboxWriter {
  readonly writes: { organizationId: string; events: OutboxEventInput[] }[] = [];

  async write(input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    this.writes.push(input);
  }
}

export class RecordingAnalysisDispatcher implements AnalysisDispatcher {
  readonly dispatched: AnalysisDispatchInput[] = [];
  dispatch(input: AnalysisDispatchInput): void {
    this.dispatched.push(input);
  }
}

export class StaticPromptTemplate implements PromptTemplatePort {
  render(key: PromptKey, _variables: PromptVariables): RenderedPrompt {
    return {
      version: PROMPT_VERSIONS[key],
      systemPrompt: "system",
      userPrompt: "user",
    };
  }
}

export type FakeContentResolverBehavior =
  | { kind: "success"; resultSummary?: string; persistThrows?: boolean }
  | { kind: "prepare_error"; error: unknown }
  | { kind: "handle_error"; error: unknown };

/** Double de test pour `AnalysisContentResolver` (mission Sprint 4.2) — découple les tests de
 *  `ProcessAnalysisJobUseCase` (cycle de vie/atomicité du job) de la logique réelle de résolution
 *  de contenu métier (testée séparément via `BusinessAnalysisContentResolver`) — même motif que
 *  `StaticPromptTemplate` pour `PromptTemplatePort`. */
export class FakeAnalysisContentResolver implements AnalysisContentResolver {
  readonly persistCalls: string[] = [];

  constructor(private readonly behavior: FakeContentResolverBehavior = { kind: "success" }) {}

  async prepare(_job: AnalysisJob): Promise<PreparedAnalysisRequest> {
    if (this.behavior.kind === "prepare_error") {
      throw this.behavior.error;
    }
    return { systemPrompt: "system", userPrompt: "user", responseSchemaName: "FakeSchema" };
  }

  async handleSuccess(_job: AnalysisJob, rawContent: string): Promise<AnalysisSuccessResult> {
    if (this.behavior.kind === "handle_error") {
      throw this.behavior.error;
    }
    const behavior = this.behavior;
    return {
      resultSummary: behavior.kind === "success" ? (behavior.resultSummary ?? "fake result summary") : "fake result summary",
      persist: async (_tx) => {
        if (behavior.kind === "success" && behavior.persistThrows) {
          throw new Error("Simulated business result persistence failure (test-only)");
        }
        this.persistCalls.push(rawContent);
      },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FakeAIProviderBehavior =
  | { kind: "success"; content?: string; usage?: Partial<AIProviderUsage>; durationMs?: number; delayMs?: number }
  | { kind: "error"; error: unknown; delayMs?: number };

/** Simule succès/timeout/rate limit/erreur d'auth/réponse invalide/latence/tokens/erreur
 *  serveur/retry réussi après échec (mission §"Fake Provider") — n'appelle jamais un vrai
 *  fournisseur IA. Un scénario à plusieurs comportements consomme un élément par appel, puis
 *  répète le dernier indéfiniment. */
export class FakeAIProvider implements AIProvider {
  readonly name = "FAKE";
  readonly calls: AIProviderRequest[] = [];
  private readonly queue: FakeAIProviderBehavior[];

  constructor(behaviors: FakeAIProviderBehavior[] = [{ kind: "success" }]) {
    this.queue = [...behaviors];
  }

  async complete(request: AIProviderRequest): Promise<AIProviderResult> {
    this.calls.push(request);
    const behavior = this.queue.length > 1 ? this.queue.shift()! : this.queue[0]!;
    if (behavior.delayMs) {
      await sleep(behavior.delayMs);
    }
    if (behavior.kind === "error") {
      throw behavior.error;
    }
    return {
      content: behavior.content ?? '{"output":{"summary":"technical pipeline check ok"}}',
      usage: {
        inputTokens: behavior.usage?.inputTokens ?? 10,
        outputTokens: behavior.usage?.outputTokens ?? 5,
        totalTokens: behavior.usage?.totalTokens ?? 15,
      },
      durationMs: behavior.durationMs ?? 1,
      providerRequestId: "fake-request-id",
    };
  }
}

export class FakeAIProviderRegistry implements AIProviderRegistry {
  constructor(private readonly provider: AIProvider | (() => AIProvider)) {}

  resolve(): AIProvider {
    return typeof this.provider === "function" ? this.provider() : this.provider;
  }
}

/** Jamais un appel réel (mission §"aucun appel réel payant n'est requis en CI") — simule le pont
 *  ai-benchmark (Sprint 5.2 §"Intégration Analysis") sans dépendre de ce module : `analysis` ne
 *  connaît que le port qu'il consomme (`RoutingPolicyResolver`), jamais l'implémentation réelle. */
export class FakeRoutingPolicyResolver implements RoutingPolicyResolver {
  constructor(private readonly decision: ActiveRoutingDecision | null | (() => ActiveRoutingDecision | null) = null) {}

  async resolveActive(): Promise<ActiveRoutingDecision | null> {
    return typeof this.decision === "function" ? this.decision() : this.decision;
  }
}

export class ThrowingRoutingPolicyResolver implements RoutingPolicyResolver {
  async resolveActive(): Promise<ActiveRoutingDecision | null> {
    throw new Error("Simulated routing policy resolution failure (test-only)");
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

/** Enregistre chaque appel `create`/`complete` (audit Codex P1-4) — permet aux tests d'affirmer
 *  qu'une décision de routage a bien été créée AVANT le premier appel provider et complétée
 *  exactement une fois, sans dépendre d'une base réelle. */
export class RecordingRoutingDecisionWriter implements RoutingDecisionWriter {
  readonly created: CreateRoutingDecisionInput[] = [];
  readonly completed: CompleteRoutingDecisionInput[] = [];

  async create(input: CreateRoutingDecisionInput): Promise<void> {
    this.created.push(input);
  }

  async complete(input: CompleteRoutingDecisionInput): Promise<void> {
    this.completed.push(input);
  }
}

export class ThrowingRoutingDecisionWriter implements RoutingDecisionWriter {
  async create(): Promise<void> {
    throw new Error("Simulated routing decision write failure (test-only)");
  }
  async complete(): Promise<void> {
    throw new Error("Simulated routing decision write failure (test-only)");
  }
}

/** Ne simule aucun verrou réel (mono-thread) — reproduit la sémantique de compare-and-set des
 *  méthodes exclusives, même motif que `InMemoryDocumentExtractionRepository` (module Extraction).
 *  Correction audit Codex Sprint 4.1 (P1-02) — `finalizeAttempt` coordonne avec un
 *  `InMemoryAnalysisAttemptRepository` pour reproduire l'atomicité job+historique de
 *  `PrismaAnalysisJobRepository` : la tentative est écrite AVANT toute mutation du job, jamais
 *  après — si l'écriture échoue, le job stocké reste intact (toujours PROCESSING). */
export class InMemoryAnalysisJobRepository implements AnalysisJobRepository {
  private readonly byId = new Map<string, AnalysisJob>();

  constructor(private readonly attemptStore: InMemoryAnalysisAttemptRepository = new InMemoryAnalysisAttemptRepository()) {}

  async findById(input: { organizationId: string; jobId: string }): Promise<AnalysisJob | null> {
    const job = this.byId.get(input.jobId);
    if (!job || job.organizationId !== input.organizationId) return null;
    return job;
  }

  async save(job: AnalysisJob): Promise<void> {
    this.byId.set(job.id, job);
  }

  async listByTarget(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: readonly AnalysisJob[]; total: number }> {
    const matching = [...this.byId.values()]
      .filter((job) => job.organizationId === input.organizationId && job.scope === input.scope && job.targetId === input.targetId)
      .sort((a, b) => b.analysisVersion - a.analysisVersion);
    return { items: matching.slice(input.offset, input.offset + input.limit), total: matching.length };
  }

  async reserveForProcessing(input: {
    organizationId: string;
    jobId: string;
    occurredAt: Date;
  }): Promise<ReservationOutcome> {
    const job = await this.findById(input);
    if (!job) throw new AnalysisNotFoundError();
    if (job.status !== AnalysisStatus.Queued) {
      return { kind: "not_startable", status: job.status };
    }
    job.reserve(input.occurredAt);
    await this.save(job);
    return { kind: "reserved", job };
  }

  async finalizeAttempt(input: {
    organizationId: string;
    jobId: string;
    expectedAttemptCount: number;
    startedAt: Date;
    occurredAt: Date;
    outcome: FinalizeAttemptOutcome;
    trigger: string;
    retryCount: number;
    onSuccessTx?: ((tx: PrismaTx) => Promise<void>) | undefined;
  }): Promise<{ applied: boolean }> {
    const job = await this.findById(input);
    if (!job || job.attemptCount !== input.expectedAttemptCount || job.status !== AnalysisStatus.Processing) {
      return { applied: false };
    }

    const outcome = input.outcome;

    // Mission Sprint 4.2 — invoqué AVANT l'écriture de l'AnalysisAttempt : dans la vraie
    // transaction Prisma, `onSuccessTx` et `attemptStore.create` (ci-dessous) sont TOUS DEUX annulés
    // ensemble si l'un des deux échoue ; ce fake en mémoire n'a pas de rollback réel, donc l'ordre
    // "le plus risqué d'abord" reproduit la même garantie observable — si `onSuccessTx` lève, aucune
    // tentative n'est même construite/poussée, le job stocké reste totalement intact (PROCESSING).
    if (input.onSuccessTx) {
      await input.onSuccessTx({} as PrismaTx);
    }

    // Écrit la tentative AVANT toute mutation du job (correction P1-02) : si `create()` échoue
    // (ex. `failNextCreate`), le job stocké dans `byId` reste totalement intact — jamais un état
    // terminal sans historique correspondant, même dans ce fake en mémoire.
    await this.attemptStore.create(
      AnalysisAttempt.create({
        id: randomUUID(),
        jobId: input.jobId,
        organizationId: input.organizationId,
        attemptNumber: input.expectedAttemptCount,
        trigger: input.trigger,
        provider: outcome.provider,
        model: outcome.model,
        outcome: outcome.kind === "succeeded" ? "SUCCEEDED" : outcome.kind === "partially_succeeded" ? "PARTIALLY_SUCCEEDED" : "FAILED",
        startedAt: input.startedAt,
        finishedAt: input.occurredAt,
        durationMs: input.occurredAt.getTime() - input.startedAt.getTime(),
        retryCount: input.retryCount,
        inputTokenCount: outcome.kind !== "failed" ? outcome.inputTokenCount : undefined,
        outputTokenCount: outcome.kind !== "failed" ? outcome.outputTokenCount : undefined,
        totalTokenCount: outcome.kind !== "failed" ? outcome.totalTokenCount : undefined,
        errorCode: outcome.kind === "failed" ? outcome.errorCode : undefined,
        errorMessage: outcome.kind === "failed" ? outcome.errorMessage : undefined,
        createdAt: input.occurredAt,
      }),
    );

    if (outcome.kind === "failed") {
      job.fail({ provider: outcome.provider, model: outcome.model, errorCode: outcome.errorCode, errorMessage: outcome.errorMessage }, input.occurredAt);
    } else {
      job.complete(
        {
          outcome: outcome.kind === "succeeded" ? AnalysisStatus.Succeeded : AnalysisStatus.PartiallySucceeded,
          provider: outcome.provider,
          model: outcome.model,
          durationMs: outcome.durationMs,
          inputTokenCount: outcome.inputTokenCount,
          outputTokenCount: outcome.outputTokenCount,
          totalTokenCount: outcome.totalTokenCount,
          resultSummary: outcome.resultSummary,
        },
        input.occurredAt,
      );
    }

    await this.save(job);
    return { applied: true };
  }

  async runExclusiveForTarget<T>(input: {
    organizationId: string;
    scope: AnalysisScope;
    targetId: string;
    fn: (context: ExclusiveTargetContext) => Promise<T>;
  }): Promise<T> {
    const context: ExclusiveTargetContext = {
      findActiveByTarget: async (query) => {
        for (const job of this.byId.values()) {
          if (
            job.organizationId === query.organizationId &&
            job.scope === query.scope &&
            job.targetId === query.targetId &&
            ([AnalysisStatus.Pending, AnalysisStatus.Queued, AnalysisStatus.Processing] as readonly AnalysisStatus[]).includes(
              job.status,
            )
          ) {
            return job;
          }
        }
        return null;
      },
      getNextVersion: async (query) => {
        let max = 0;
        for (const job of this.byId.values()) {
          if (job.organizationId === query.organizationId && job.scope === query.scope && job.targetId === query.targetId) {
            max = Math.max(max, job.analysisVersion);
          }
        }
        return max + 1;
      },
      create: async (job) => {
        await this.save(job);
      },
    };
    return input.fn(context);
  }

  async runExclusiveForJob<T>(input: {
    organizationId: string;
    jobId: string;
    fn: (job: AnalysisJob) => Promise<T>;
  }): Promise<T> {
    const job = await this.findById(input);
    if (!job) throw new AnalysisNotFoundError();
    const result = await input.fn(job);
    await this.save(job);
    return result;
  }

  async findStaleProcessingCandidates(input: { olderThan: Date; limit: number }): Promise<readonly { organizationId: string; jobId: string }[]> {
    return [...this.byId.values()]
      .filter((job) => job.status === AnalysisStatus.Processing && job.updatedAt < input.olderThan)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .slice(0, input.limit)
      .map((job) => ({ organizationId: job.organizationId, jobId: job.id }));
  }
}

export class InMemoryAnalysisAttemptRepository implements AnalysisAttemptRepository {
  readonly attempts: AnalysisAttempt[] = [];
  /** Réservé aux tests d'atomicité (correction audit Codex P1-02) — fait échouer le PROCHAIN
   *  appel à `create()` puis se réarme automatiquement, pour simuler une panne de persistance de
   *  l'historique sans affecter les appels suivants. */
  failNextCreate = false;

  async create(attempt: AnalysisAttempt): Promise<void> {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("Simulated AnalysisAttempt persistence failure (test-only)");
    }
    this.attempts.push(attempt);
  }

  async listByJobId(input: { organizationId: string; jobId: string }): Promise<AnalysisAttempt[]> {
    return this.attempts.filter((attempt) => attempt.organizationId === input.organizationId && attempt.jobId === input.jobId);
  }
}

type StoredDocumentAnalysis = DocumentAnalysisRecord & { organizationId: string; tenderId: string };
type StoredFinding<T> = T & { organizationId: string; tenderId: string; analysisVersion: number };

/** Double de test pour `BusinessAnalysisRepository` (mission Sprint 4.2) — même motif que les
 *  autres fakes en mémoire de ce module : aucune transaction réelle (mono-thread), mais reproduit
 *  fidèlement la sémantique de pagination/filtrage par `analysisVersion` du repository Prisma. */
export class InMemoryBusinessAnalysisRepository implements BusinessAnalysisRepository {
  private readonly documentAnalyses: StoredDocumentAnalysis[] = [];
  private readonly deadlines: StoredFinding<DeadlineFindingRecord>[] = [];
  private readonly criteria: StoredFinding<CriterionFindingRecord>[] = [];
  private readonly requirements: StoredFinding<RequirementFindingRecord>[] = [];
  private readonly clauses: StoredFinding<ClauseFindingRecord>[] = [];
  private readonly risks: StoredFinding<RiskFindingRecord>[] = [];
  private readonly questions: StoredFinding<QuestionFindingRecord>[] = [];
  private readonly summaries: (TenderAnalysisSummaryRecord & { organizationId: string; tenderId: string })[] = [];

  async persistDocumentAnalysis(_tx: PrismaTx, input: PersistDocumentAnalysisInput): Promise<void> {
    this.documentAnalyses.push({
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      documentId: input.documentId,
      documentVersionId: input.documentVersionId,
      analysisVersion: input.analysisVersion,
      documentType: input.output.documentType,
      language: input.output.language,
      metadata: input.output.metadata,
      deadlines: input.output.deadlines,
      criteria: input.output.criteria,
      requirements: input.output.requirements,
      clauses: input.output.clauses,
      warnings: input.output.warnings,
    });
  }

  async persistTenderConsolidation(_tx: PrismaTx, input: PersistTenderConsolidationInput): Promise<void> {
    const base = { organizationId: input.organizationId, tenderId: input.tenderId, analysisVersion: input.analysisVersion };
    const now = new Date().toISOString();
    // Audit Codex P1-004 (round 3) — même comportement que PrismaBusinessAnalysisRepository :
    // le documentVersionId gravé vient EXCLUSIVEMENT du snapshot fourni par l'appelant.
    const documentVersionOf = (documentId: string | undefined | null): string | undefined =>
      (documentId ? input.documentVersionsByDocumentId[documentId] : undefined) ?? undefined;
    for (const item of input.output.deadlines) {
      this.deadlines.push({ id: randomUUID(), createdAt: now, ...item, ...base, documentVersionId: documentVersionOf(item.documentId) });
    }
    for (const item of input.output.criteria) {
      this.criteria.push({ id: randomUUID(), createdAt: now, ...item, ...base, documentVersionId: documentVersionOf(item.documentId) });
    }
    for (const item of input.output.requirements) {
      this.requirements.push({ id: randomUUID(), createdAt: now, ...item, ...base, documentVersionId: documentVersionOf(item.documentId) });
    }
    for (const item of input.output.clauses) {
      this.clauses.push({ id: randomUUID(), createdAt: now, ...item, ...base });
    }
    for (const item of input.output.risks) {
      this.risks.push({ id: randomUUID(), createdAt: now, ...item, ...base, documentVersionId: documentVersionOf(item.documentId) });
    }
    for (const item of input.output.questions) {
      this.questions.push({ id: randomUUID(), createdAt: now, ...item, ...base });
    }
    this.summaries.push({ id: randomUUID(), ...base, ...input.output.summary, createdAt: now });
  }

  async findLatestDocumentAnalyses(input: { organizationId: string; tenderId: string }): Promise<DocumentAnalysisRecord[]> {
    const byDocument = new Map<string, StoredDocumentAnalysis>();
    for (const analysis of this.documentAnalyses) {
      if (analysis.organizationId !== input.organizationId || analysis.tenderId !== input.tenderId) continue;
      const existing = byDocument.get(analysis.documentId);
      if (!existing || analysis.analysisVersion > existing.analysisVersion) {
        byDocument.set(analysis.documentId, analysis);
      }
    }
    return [...byDocument.values()];
  }

  private paginate<T>(items: readonly T[], page: ListPage): PageResult<T> {
    return { items: items.slice(page.offset, page.offset + page.limit), total: items.length };
  }

  private scoped<T extends { organizationId: string; tenderId: string; analysisVersion: number }>(
    items: readonly T[],
    input: { organizationId: string; tenderId: string; analysisVersion: number },
  ): T[] {
    return items.filter(
      (item) => item.organizationId === input.organizationId && item.tenderId === input.tenderId && item.analysisVersion === input.analysisVersion,
    );
  }

  async listDeadlines(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<DeadlineFindingRecord>> {
    return this.paginate(this.scoped(this.deadlines, input), input);
  }

  async listCriteria(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<CriterionFindingRecord>> {
    return this.paginate(this.scoped(this.criteria, input), input);
  }

  async listRequirements(
    input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage,
  ): Promise<PageResult<RequirementFindingRecord>> {
    return this.paginate(this.scoped(this.requirements, input), input);
  }

  async listClauses(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<ClauseFindingRecord>> {
    return this.paginate(this.scoped(this.clauses, input), input);
  }

  async listRisks(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<RiskFindingRecord>> {
    return this.paginate(this.scoped(this.risks, input), input);
  }

  async listQuestions(input: { organizationId: string; tenderId: string; analysisVersion: number } & ListPage): Promise<PageResult<QuestionFindingRecord>> {
    return this.paginate(this.scoped(this.questions, input), input);
  }

  async getSummary(input: { organizationId: string; tenderId: string; analysisVersion: number }): Promise<TenderAnalysisSummaryRecord | null> {
    return (
      this.summaries.find(
        (summary) =>
          summary.organizationId === input.organizationId && summary.tenderId === input.tenderId && summary.analysisVersion === input.analysisVersion,
      ) ?? null
    );
  }

  async getLatestSummary(input: { organizationId: string; tenderId: string }): Promise<TenderAnalysisSummaryRecord | null> {
    const matching = this.summaries.filter((summary) => summary.organizationId === input.organizationId && summary.tenderId === input.tenderId);
    if (matching.length === 0) return null;
    return matching.reduce((latest, current) => (current.analysisVersion > latest.analysisVersion ? current : latest));
  }
}

export class InMemoryTenderAnalysisSummaryRevisionRepository implements TenderAnalysisSummaryRevisionRepository {
  private readonly revisions: TenderAnalysisSummaryRevisionRecord[] = [];

  async create(input: CreateTenderAnalysisSummaryRevisionInput): Promise<TenderAnalysisSummaryRevisionRecord> {
    const revisionNumber =
      this.revisions.filter((revision) => revision.organizationId === input.organizationId && revision.baseSummaryId === input.baseSummaryId).length + 1;
    const record: TenderAnalysisSummaryRevisionRecord = {
      id: input.id,
      organizationId: input.organizationId,
      tenderId: input.tenderId,
      baseSummaryId: input.baseSummaryId,
      revisionNumber,
      opportunitySummary: input.opportunitySummary,
      complexityLevel: input.complexityLevel,
      mainCriteria: input.mainCriteria,
      mainRisks: input.mainRisks,
      mainObligations: input.mainObligations,
      missingElements: input.missingElements,
      pointsToClarify: input.pointsToClarify,
      conflicts: input.conflicts,
      editedByUserId: input.editedByUserId,
      editedAt: input.editedAt.toISOString(),
      reason: input.reason,
    };
    this.revisions.push(record);
    return record;
  }

  async listByBaseSummaryId(input: { organizationId: string; baseSummaryId: string }): Promise<TenderAnalysisSummaryRevisionRecord[]> {
    return this.revisions
      .filter((revision) => revision.organizationId === input.organizationId && revision.baseSummaryId === input.baseSummaryId)
      .sort((a, b) => b.revisionNumber - a.revisionNumber);
  }
}
