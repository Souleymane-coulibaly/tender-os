import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkRunSummary, type BenchmarkRunSummary } from "../dtos";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";

export type ListBenchmarkRunsQuery = Readonly<{ organizationId: string; actorRole: string }>;

@Injectable()
export class ListBenchmarkRunsUseCase {
  constructor(@Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository) {}

  async execute(query: ListBenchmarkRunsQuery): Promise<readonly BenchmarkRunSummary[]> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);
    const runs = await this.benchmarkRunRepository.list({ organizationId: query.organizationId });
    return runs.map(toBenchmarkRunSummary);
  }
}
