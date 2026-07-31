import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { BenchmarkSuiteNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkSuiteSummary, type BenchmarkSuiteSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_CASE_REPOSITORY, type BenchmarkCaseRepository } from "../ports/benchmark-case.repository";
import { BENCHMARK_SUITE_REPOSITORY, type BenchmarkSuiteRepository } from "../ports/benchmark-suite.repository";

export type PublishBenchmarkSuiteCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  suiteId: string;
  requestId?: string | undefined;
}>;

@Injectable()
export class PublishBenchmarkSuiteUseCase {
  constructor(
    @Inject(BENCHMARK_SUITE_REPOSITORY) private readonly benchmarkSuiteRepository: BenchmarkSuiteRepository,
    @Inject(BENCHMARK_CASE_REPOSITORY) private readonly benchmarkCaseRepository: BenchmarkCaseRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: PublishBenchmarkSuiteCommand): Promise<BenchmarkSuiteSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const suite = await this.benchmarkSuiteRepository.findById({ id: command.suiteId });
    if (!suite) {
      throw new BenchmarkSuiteNotFoundError();
    }

    const caseCount = await this.benchmarkCaseRepository.countBySuite({ suiteId: command.suiteId });
    suite.publish(caseCount > 0, this.clock.now());

    await this.benchmarkSuiteRepository.save(suite);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_suite.published",
      resourceType: "benchmark_suite",
      resourceId: suite.id,
      requestId: command.requestId,
      metadata: { version: suite.version, caseCount },
    });

    return toBenchmarkSuiteSummary(suite, caseCount);
  }
}
