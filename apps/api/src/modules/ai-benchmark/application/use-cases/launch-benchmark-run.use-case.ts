import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkRun } from "../../domain/benchmark-run.aggregate";
import { BenchmarkRunModel } from "../../domain/benchmark-run-model.entity";
import type { AiModelPricingSnapshot } from "../../domain/pricing-snapshot.entity";
import {
  AiModelNotFoundError,
  AiModelNotEnabledForBenchmarkError,
  BenchmarkSuiteEmptyError,
  BenchmarkSuiteNotFoundError,
  InvalidBenchmarkRunParametersError,
  PricingSnapshotNotFoundError,
} from "../../domain/errors";
import { AI_BENCHMARK_CONFIG, type AiBenchmarkConfig } from "../../infrastructure/ai-benchmark-config";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { assertWithinCostCeiling, estimateBenchmarkRunCost } from "../policies/benchmark-cost-estimation.policy";
import { toBenchmarkRunSummary, type BenchmarkRunSummary } from "../dtos";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_RUN_DISPATCHER, type BenchmarkRunDispatcher } from "../ports/benchmark-run-dispatcher";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../ports/pricing-snapshot.repository";

export type LaunchBenchmarkRunCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  suiteId: string;
  modelIds: readonly string[];
  repetitions: number;
  concurrencyLimit: number;
  costCeilingAmount?: string | undefined;
  requestId?: string | undefined;
}>;

/** Lance un run (Sprint 5.2 §"Exécution du benchmark") — vérifie CHAQUE garde-fou avant de créer
 *  la moindre ligne : suite publiée et non vide, modèles autorisés au benchmark, coût sous le
 *  plafond. Créé PENDING, jamais RUNNING directement (voir `ExecuteBenchmarkRunUseCase`). */
@Injectable()
export class LaunchBenchmarkRunUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(BENCHMARK_RUN_DISPATCHER) private readonly dispatcher: BenchmarkRunDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(AI_BENCHMARK_CONFIG) private readonly config: AiBenchmarkConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: LaunchBenchmarkRunCommand): Promise<BenchmarkRunSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    if (command.modelIds.length === 0 || command.modelIds.length > this.config.maxModelsPerRun) {
      throw new InvalidBenchmarkRunParametersError(
        `modelIds must contain between 1 and ${this.config.maxModelsPerRun} entries.`,
      );
    }

    const suite = await this.benchmarkSuiteRepository.findById({ id: command.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }
    const caseCount = await this.benchmarkCaseRepository.countBySuite({ suiteId: command.suiteId });
    if (caseCount === 0) {
      throw new BenchmarkSuiteEmptyError();
    }

    const pricingByModel = new Map<string, AiModelPricingSnapshot>();
    const pricingSnapshots = [];
    for (const modelId of command.modelIds) {
      const model = await this.aiModelRepository.findById({ id: modelId });
      if (!model) {
        throw new AiModelNotFoundError();
      }
      if (!model.enabledForBenchmark) {
        throw new AiModelNotEnabledForBenchmarkError();
      }
      const snapshot = await this.pricingSnapshotRepository.findCurrent({ aiModelId: modelId });
      if (!snapshot) {
        throw new PricingSnapshotNotFoundError();
      }
      pricingByModel.set(modelId, snapshot);
      pricingSnapshots.push(snapshot);
    }

    const estimate = estimateBenchmarkRunCost({
      pricingSnapshots,
      caseCount,
      repetitions: command.repetitions,
      estimatedInputTokensPerCase: this.config.estimatedInputTokensPerCase,
      estimatedOutputTokensPerCase: this.config.estimatedOutputTokensPerCase,
    });

    const costCeilingAmount = command.costCeilingAmount ?? this.config.defaultCostCeilingAmount;
    assertWithinCostCeiling(estimate, costCeilingAmount);

    const now = this.clock.now();
    const run = BenchmarkRun.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      suiteId: command.suiteId,
      suiteVersion: suite.version,
      repetitions: command.repetitions,
      concurrencyLimit: command.concurrencyLimit,
      estimatedCostAmount: estimate.amount,
      estimatedCostCurrency: estimate.currency,
      costCeilingAmount,
      launchedByUserId: command.actorId,
      occurredAt: now,
    });

    const runModels = command.modelIds.map((modelId) => {
      const snapshot = pricingByModel.get(modelId)!;
      return BenchmarkRunModel.create({
        id: this.idGenerator.generate(),
        runId: run.id,
        aiModelId: modelId,
        pricingSnapshotId: snapshot.id,
        pricingCurrency: snapshot.currency,
        pricingInputPricePerMillionTokens: snapshot.inputPricePerMillionTokens,
        pricingOutputPricePerMillionTokens: snapshot.outputPricePerMillionTokens,
        pricingEffectiveFrom: snapshot.effectiveFrom,
        occurredAt: now,
      });
    });

    await this.benchmarkRunRepository.createWithModels(run, runModels);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_run.launched",
      resourceType: "benchmark_run",
      resourceId: run.id,
      requestId: command.requestId,
      metadata: { suiteId: command.suiteId, modelCount: command.modelIds.length, estimatedCostAmount: estimate.amount },
    });

    this.dispatcher.dispatch({ organizationId: command.organizationId, runId: run.id, requestId: command.requestId });

    return toBenchmarkRunSummary(run);
  }
}
