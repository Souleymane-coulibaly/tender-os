import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { AiModelNotFoundError, AiModelNotEnabledForBenchmarkError, BenchmarkSuiteNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { estimateBenchmarkRunCost, type BenchmarkCostEstimate } from "../policies/benchmark-cost-estimation.policy";
import { AI_BENCHMARK_CONFIG, type AiBenchmarkConfig } from "../../infrastructure/ai-benchmark-config";
import { AI_MODEL_REPOSITORY, type AiModelRepository } from "../ports/ai-model.repository";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";
import { PRICING_SNAPSHOT_REPOSITORY, type PricingSnapshotRepository } from "../ports/pricing-snapshot.repository";

export type EstimateBenchmarkRunCostQuery = Readonly<{
  actorRole: string;
  suiteId: string;
  modelIds: readonly string[];
  repetitions: number;
}>;

@Injectable()
export class EstimateBenchmarkRunCostUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
    @Inject(AI_MODEL_REPOSITORY) private readonly aiModelRepository: AiModelRepository,
    @Inject(PRICING_SNAPSHOT_REPOSITORY) private readonly pricingSnapshotRepository: PricingSnapshotRepository,
    @Inject(AI_BENCHMARK_CONFIG) private readonly config: AiBenchmarkConfig,
  ) {}

  async execute(query: EstimateBenchmarkRunCostQuery): Promise<BenchmarkCostEstimate> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);

    const suite = await this.benchmarkSuiteRepository.findById({ id: query.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }
    const caseCount = await this.benchmarkCaseRepository.countBySuite({ suiteId: query.suiteId });

    const pricingSnapshots = [];
    for (const modelId of query.modelIds) {
      const model = await this.aiModelRepository.findById({ id: modelId });
      if (!model) {
        throw new AiModelNotFoundError();
      }
      if (!model.enabledForBenchmark) {
        throw new AiModelNotEnabledForBenchmarkError();
      }
      const snapshot = await this.pricingSnapshotRepository.findCurrent({ aiModelId: modelId });
      if (snapshot) {
        pricingSnapshots.push(snapshot);
      }
    }

    return estimateBenchmarkRunCost({
      pricingSnapshots,
      caseCount,
      repetitions: query.repetitions,
      estimatedInputTokensPerCase: this.config.estimatedInputTokensPerCase,
      estimatedOutputTokensPerCase: this.config.estimatedOutputTokensPerCase,
    });
  }
}
