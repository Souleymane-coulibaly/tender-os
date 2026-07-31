import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkSuiteNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkCaseSummary, toBenchmarkSuiteSummary, type BenchmarkCaseSummary, type BenchmarkSuiteSummary } from "../dtos";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type GetBenchmarkSuiteQuery = Readonly<{ actorRole: string; suiteId: string }>;
export type GetBenchmarkSuiteResult = Readonly<{ suite: BenchmarkSuiteSummary; cases: readonly BenchmarkCaseSummary[] }>;

@Injectable()
export class GetBenchmarkSuiteUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
  ) {}

  async execute(query: GetBenchmarkSuiteQuery): Promise<GetBenchmarkSuiteResult> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);

    const suite = await this.benchmarkSuiteRepository.findById({ id: query.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }

    const cases = await this.benchmarkCaseRepository.listBySuite({ suiteId: query.suiteId });

    return { suite: toBenchmarkSuiteSummary(suite, cases.length), cases: cases.map(toBenchmarkCaseSummary) };
  }
}
