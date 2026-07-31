import type { BenchmarkSuite } from "../../domain/benchmark-suite.aggregate";

/** Corpus global (Sprint 5.2 §"Corpus de benchmark", contenu strictement synthétique — jamais de
 *  donnée tenant réelle) — pas de `organizationId` : partagé en lecture par toutes les organisations. */
export interface BenchmarkSuiteRepository {
  findById(input: { id: string }): Promise<BenchmarkSuite | null>;
  findLatestVersionByName(input: { name: string }): Promise<BenchmarkSuite | null>;
  list(): Promise<readonly BenchmarkSuite[]>;
  create(suite: BenchmarkSuite): Promise<void>;
  save(suite: BenchmarkSuite): Promise<void>;
}

export const BENCHMARK_SUITE_REPOSITORY = Symbol("BENCHMARK_SUITE_REPOSITORY");
