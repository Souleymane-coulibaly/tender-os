import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkRunNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { aggregateBenchmarkRunResultsByModel } from "../services/aggregate-benchmark-run-results";
import { toBenchmarkCaseResultSummary, type BenchmarkCaseResultSummary, type BenchmarkRunModelComparison } from "../dtos";
import { BENCHMARK_CASE_RESULT_REPOSITORY, type BenchmarkCaseResultRepository } from "../ports/benchmark-case-result.repository";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";

export type GetBenchmarkRunResultsQuery = Readonly<{ organizationId: string; actorRole: string; runId: string }>;
export type GetBenchmarkRunResultsResult = Readonly<{
  comparisons: readonly BenchmarkRunModelComparison[];
  results: readonly BenchmarkCaseResultSummary[];
}>;

/** Classement + détail par cas (Sprint 5.2 §"Comparaison") — l'agrégation est calculée à la lecture
 *  (voir `aggregateBenchmarkRunResultsByModel`), jamais persistée séparément : un run reste borné
 *  en taille (≤5 répétitions × un nombre de cas modeste × quelques modèles). */
@Injectable()
export class GetBenchmarkRunResultsUseCase {
  constructor(
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(BENCHMARK_CASE_RESULT_REPOSITORY) private readonly benchmarkCaseResultRepository: BenchmarkCaseResultRepository,
  ) {}

  async execute(query: GetBenchmarkRunResultsQuery): Promise<GetBenchmarkRunResultsResult> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);

    const run = await this.benchmarkRunRepository.findById({ organizationId: query.organizationId, runId: query.runId });
    if (!run) {
      throw new BenchmarkRunNotFoundError();
    }

    const results = await this.benchmarkCaseResultRepository.listByRun({ runId: query.runId });

    return {
      comparisons: aggregateBenchmarkRunResultsByModel(results),
      results: results.map(toBenchmarkCaseResultSummary),
    };
  }
}
