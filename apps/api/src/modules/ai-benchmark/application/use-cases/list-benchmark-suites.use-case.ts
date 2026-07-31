import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkSuiteSummary, type BenchmarkSuiteSummary } from "../dtos";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type ListBenchmarkSuitesQuery = Readonly<{ actorRole: string }>;

@Injectable()
export class ListBenchmarkSuitesUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
  ) {}

  async execute(query: ListBenchmarkSuitesQuery): Promise<readonly BenchmarkSuiteSummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);

    const suites = await this.benchmarkSuiteRepository.list();
    return Promise.all(
      suites.map(async (suite) => {
        const caseCount = await this.benchmarkCaseRepository.countBySuite({ suiteId: suite.id });
        return toBenchmarkSuiteSummary(suite, caseCount);
      }),
    );
  }
}
