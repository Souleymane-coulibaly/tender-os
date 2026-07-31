import type { BenchmarkCase } from "../../domain/benchmark-case.entity";

export interface BenchmarkCaseRepository {
  findById(input: { id: string }): Promise<BenchmarkCase | null>;
  listBySuite(input: { suiteId: string }): Promise<readonly BenchmarkCase[]>;
  countBySuite(input: { suiteId: string }): Promise<number>;
  create(benchmarkCase: BenchmarkCase): Promise<void>;
}

export const BENCHMARK_CASE_REPOSITORY = Symbol("BENCHMARK_CASE_REPOSITORY");
