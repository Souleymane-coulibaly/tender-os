import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import {
  AI_PROVIDER_REGISTRY,
  PROMPT_TEMPLATE,
  type AIProvider,
  type AIProviderRegistry,
  type PromptKey,
  type PromptTemplatePort,
} from "../../../analysis";
import type { AiModel } from "../../domain/ai-model.aggregate";
import type { BenchmarkCase } from "../../domain/benchmark-case.entity";
import type { BenchmarkRunModel } from "../../domain/benchmark-run-model.entity";
import { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";
import { BenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { calculateGlobalScore } from "../../domain/scoring/benchmark-score-calculator";
import { evaluateBenchmarkCaseOutput } from "../../domain/scoring/benchmark-case-evaluator";
import { AI_BENCHMARK_CONFIG, type AiBenchmarkConfig } from "../../infrastructure/ai-benchmark-config";
import { runWithConcurrencyLimit } from "../services/concurrency-limited-runner";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_CASE_RESULT_REPOSITORY, type BenchmarkCaseResultRepository } from "../ports/benchmark-case-result.repository";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type ExecuteBenchmarkRunCommand = Readonly<{ organizationId: string; runId: string }>;

/** Score minimal pour qu'une tentative soit considérée "réussie" (mission §"taux de réussite") —
 *  nommé plutôt qu'un nombre magique, indépendant du seuil d'élimination par modèle (plus strict,
 *  lui appliqué à la moyenne, pas à une tentative isolée). */
const CASE_PASS_SCORE_THRESHOLD = 0.5;

function resultKey(input: { caseId: string; aiModelId: string; repetitionIndex: number }): string {
  return `${input.caseId}::${input.aiModelId}::${input.repetitionIndex}`;
}

/**
 * Exécute un run (Sprint 5.2 §"Exécution du benchmark") — même motif en 3 phases que
 * `ProcessAnalysisJobUseCase` : réservation courte (start), traitement hors verrou avec
 * concurrence bornée, finalisation courte. Jamais un appel provider dans une transaction Prisma.
 * Une erreur sur UNE tentative ne doit jamais interrompre les autres (mission §"conserver chaque
 * résultat séparément") — chaque tentative persiste son propre résultat, succès ou échec.
 *
 * Audit Codex P1-2 : le coût est calculé exclusivement à partir du tarif FIGÉ sur le
 * `BenchmarkRunModel` de ce run (`computeCost`) — jamais un rechargement du tarif courant du
 * modèle (`PricingSnapshotRepository.findCurrent` n'est plus appelé ici du tout). Un nouveau tarif
 * ajouté après le lancement ne change donc jamais le coût d'un run déjà lancé, y compris lors
 * d'une reprise après un run resté RUNNING trop longtemps (voir `RecoverStaleBenchmarkRunsUseCase`).
 *
 * Audit Codex P1-3 : IDEMPOTENT — au début de l'exécution, les résultats déjà persistés pour ce
 * run sont chargés et les tentatives déjà couvertes (cas × modèle × répétition) sont exclues de la
 * liste de tâches. Une reprise après un crash/une stale-recovery ne recalcule et ne duplique donc
 * jamais un résultat déjà obtenu.
 */
@Injectable()
export class ExecuteBenchmarkRunUseCase {
  private readonly logger = new Logger(ExecuteBenchmarkRunUseCase.name);
  private readonly resolvedProviders = new Map<string, AIProvider>();

  constructor(
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
    @Inject(BENCHMARK_CASE_RESULT_REPOSITORY) private readonly benchmarkCaseResultRepository: BenchmarkCaseResultRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(AI_PROVIDER_REGISTRY) private readonly providerRegistry: AIProviderRegistry,
    @Inject(PROMPT_TEMPLATE) private readonly promptTemplate: PromptTemplatePort,
    @Inject(AI_BENCHMARK_CONFIG) private readonly config: AiBenchmarkConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: ExecuteBenchmarkRunCommand): Promise<void> {
    const run = await this.benchmarkRunRepository.findById({ organizationId: command.organizationId, runId: command.runId });
    if (!run) {
      this.logger.warn(`Benchmark run ${command.runId} not found — skipping.`);
      return;
    }
    if (run.status !== BenchmarkRunStatus.Pending) {
      this.logger.warn(`Skipping benchmark run ${command.runId}: status is ${run.status}, not startable.`);
      return;
    }

    run.start(this.clock.now());
    await this.benchmarkRunRepository.save(run);

    const suite = await this.benchmarkSuiteRepository.findById({ id: run.suiteId });
    const cases = await this.benchmarkCaseRepository.listBySuite({ suiteId: run.suiteId });
    const runModels = await this.benchmarkRunRepository.listRunModels({ runId: run.id });

    if (!suite || cases.length === 0 || runModels.length === 0) {
      run.complete(BenchmarkRunStatus.Failed, this.clock.now());
      await this.benchmarkRunRepository.save(run);
      return;
    }

    // Audit Codex P1-3 — idempotence : ne jamais recalculer/dupliquer une tentative déjà terminée
    // lors d'une reprise (stale recovery ou retry manuel après un crash).
    const existingResults = await this.benchmarkCaseResultRepository.listByRun({ runId: run.id });
    const alreadyDone = new Set(
      existingResults.map((result) =>
        resultKey({ caseId: result.caseId, aiModelId: result.aiModelId, repetitionIndex: result.repetitionIndex }),
      ),
    );

    const tasks: (() => Promise<void>)[] = [];
    for (const runModel of runModels) {
      const aiModel = await this.aiModelRepository.findById({ id: runModel.aiModelId });
      if (!aiModel) continue;

      for (const benchmarkCase of cases) {
        for (let repetitionIndex = 1; repetitionIndex <= run.repetitions; repetitionIndex++) {
          if (alreadyDone.has(resultKey({ caseId: benchmarkCase.id, aiModelId: aiModel.id, repetitionIndex }))) {
            continue;
          }
          tasks.push(() =>
            this.executeOneAttempt({
              runId: run.id,
              promptKey: suite.promptKey,
              benchmarkCase,
              aiModel,
              runModel,
              repetitionIndex,
            }),
          );
        }
      }
    }

    await runWithConcurrencyLimit(tasks, run.concurrencyLimit, async () => {
      const latest = await this.benchmarkRunRepository.findById({ organizationId: command.organizationId, runId: command.runId });
      return latest?.cancelRequested ?? false;
    });

    const latestRun = await this.benchmarkRunRepository.findById({ organizationId: command.organizationId, runId: command.runId });
    if (!latestRun) return;

    if (latestRun.cancelRequested) {
      latestRun.cancel(this.clock.now());
      await this.benchmarkRunRepository.save(latestRun);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "SYSTEM",
        action: "benchmark_run.cancelled",
        resourceType: "benchmark_run",
        resourceId: run.id,
      });
      return;
    }

    const results = await this.benchmarkCaseResultRepository.listByRun({ runId: run.id });
    const failureCount = results.filter((r) => r.errorCode !== undefined).length;
    const finalStatus =
      failureCount === 0
        ? BenchmarkRunStatus.Succeeded
        : failureCount === results.length
          ? BenchmarkRunStatus.Failed
          : BenchmarkRunStatus.PartiallySucceeded;

    latestRun.complete(finalStatus, this.clock.now());
    await this.benchmarkRunRepository.save(latestRun);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "SYSTEM",
      action: "benchmark_run.completed",
      resourceType: "benchmark_run",
      resourceId: run.id,
      metadata: { status: finalStatus, resultCount: results.length },
    });
  }

  private resolveProviderFor(provider: string): AIProvider {
    const cached = this.resolvedProviders.get(provider);
    if (cached) return cached;
    const resolved = this.providerRegistry.resolve({ provider });
    this.resolvedProviders.set(provider, resolved);
    return resolved;
  }

  private async executeOneAttempt(input: {
    runId: string;
    promptKey: PromptKey;
    benchmarkCase: BenchmarkCase;
    aiModel: AiModel;
    runModel: BenchmarkRunModel;
    repetitionIndex: number;
  }): Promise<void> {
    const resultId = this.idGenerator.generate();

    try {
      const rendered = this.promptTemplate.render(input.promptKey, input.benchmarkCase.inputVariables);
      const provider = this.resolveProviderFor(input.aiModel.provider);

      const result = await provider.complete({
        model: input.aiModel.modelKey,
        systemPrompt: rendered.systemPrompt,
        userPrompt: rendered.userPrompt,
        responseSchemaName: input.promptKey,
        timeoutMs: this.config.caseTimeoutMs,
      });

      const evaluation = evaluateBenchmarkCaseOutput({
        rawOutput: result.content,
        expectedOutput: input.benchmarkCase.expectedOutput,
        expectedProvenance: input.benchmarkCase.expectedProvenance,
      });
      const score = calculateGlobalScore(evaluation.dimensions, 0);
      // Audit Codex P1-2 : jamais un modèle sans tarif produisant un coût de 0 — `actualCostAmount`
      // reste `undefined` (COST_UNKNOWN) uniquement dans le cas défensif où `runModel` n'aurait
      // structurellement aucun tarif figé (ne peut plus arriver via LaunchBenchmarkRunUseCase, qui
      // refuse le lancement sans tarif — conservé pour ne jamais planter sur une incohérence de
      // données future). Un coût réellement nul (modèle gratuit) reste distinct : "0.000000", pas
      // `undefined`.
      const actualCostAmount = input.runModel.computeCost({
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });

      const caseResult = BenchmarkCaseResult.create({
        id: resultId,
        runId: input.runId,
        caseId: input.benchmarkCase.id,
        aiModelId: input.aiModel.id,
        pricingSnapshotId: input.runModel.pricingSnapshotId,
        repetitionIndex: input.repetitionIndex,
        provider: provider.name,
        model: input.aiModel.modelKey,
        rawOutput: result.content.slice(0, this.config.maxRawOutputLength),
        inputTokenCount: result.usage.inputTokens,
        outputTokenCount: result.usage.outputTokens,
        totalTokenCount: result.usage.totalTokens,
        durationMs: result.durationMs,
        actualCostAmount,
        evaluationPassed: evaluation.jsonValid && score >= CASE_PASS_SCORE_THRESHOLD,
        evaluationScore: score,
        evaluationDetails: { ...evaluation.details, dimensions: evaluation.dimensions },
        eliminationSignal: {
          criticalHallucination: evaluation.criticalHallucinationDetected,
          invalidProvenance: evaluation.invalidProvenanceDetected,
        },
        createdAt: this.clock.now(),
      });

      await this.benchmarkCaseResultRepository.create(caseResult);
    } catch (error) {
      const caseResult = BenchmarkCaseResult.create({
        id: resultId,
        runId: input.runId,
        caseId: input.benchmarkCase.id,
        aiModelId: input.aiModel.id,
        repetitionIndex: input.repetitionIndex,
        evaluationPassed: false,
        evaluationScore: 0,
        evaluationDetails: {},
        errorCode: this.errorCode(error),
        errorMessage: error instanceof Error ? error.message : String(error),
        createdAt: this.clock.now(),
      });
      await this.benchmarkCaseResultRepository.create(caseResult);
    }
  }

  private errorCode(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string") {
      return (error as { code: string }).code;
    }
    return "AI_INVALID_RESPONSE";
  }
}
