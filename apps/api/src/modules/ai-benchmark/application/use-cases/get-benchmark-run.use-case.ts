import { Inject, Injectable } from "@nestjs/common";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkRunNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkRunSummary, type BenchmarkRunSummary } from "../dtos";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";

export type GetBenchmarkRunQuery = Readonly<{ organizationId: string; actorRole: string; runId: string }>;

@Injectable()
export class GetBenchmarkRunUseCase {
  constructor(@Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository) {}

  async execute(query: GetBenchmarkRunQuery): Promise<BenchmarkRunSummary> {
    assertHasAiBenchmarkPermission(query.actorRole, AiBenchmarkPermission.ReadBenchmarks);

    const run = await this.benchmarkRunRepository.findById({ organizationId: query.organizationId, runId: query.runId });
    if (!run) {
      throw new BenchmarkRunNotFoundError();
    }

    return toBenchmarkRunSummary(run);
  }
}
