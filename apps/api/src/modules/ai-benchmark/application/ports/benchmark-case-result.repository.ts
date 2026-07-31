import type { BenchmarkCaseResult } from "../../domain/benchmark-case-result.entity";

export interface BenchmarkCaseResultRepository {
  create(result: BenchmarkCaseResult): Promise<void>;
  listByRun(input: { runId: string }): Promise<readonly BenchmarkCaseResult[]>;
}

export const BENCHMARK_CASE_RESULT_REPOSITORY = Symbol("BENCHMARK_CASE_RESULT_REPOSITORY");
