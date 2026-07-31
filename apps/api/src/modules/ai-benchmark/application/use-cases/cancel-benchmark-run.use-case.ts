import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AiBenchmarkPermission } from "../../domain/ai-benchmark-permission";
import { isTerminalBenchmarkRunStatus } from "../../domain/benchmark-run-status";
import { BenchmarkRunNotCancellableError, BenchmarkRunNotFoundError } from "../../domain/errors";
import { assertHasAiBenchmarkPermission } from "../policies/ai-benchmark-authorization.policy";
import { toBenchmarkRunSummary, type BenchmarkRunSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";

export type CancelBenchmarkRunCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  runId: string;
  requestId?: string | undefined;
}>;

/** Signal COOPÉRATIF (mission §"annulation") — ne force jamais un arrêt immédiat du provider en
 *  cours ; le dispatcher/exécuteur vérifie ce signal entre deux tentatives (voir
 *  `ExecuteBenchmarkRunUseCase`). Un run déjà terminal ne peut plus être annulé. */
@Injectable()
export class CancelBenchmarkRunUseCase {
  constructor(
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CancelBenchmarkRunCommand): Promise<BenchmarkRunSummary> {
    assertHasAiBenchmarkPermission(command.actorRole, AiBenchmarkPermission.LaunchBenchmark);

    const run = await this.benchmarkRunRepository.findById({ organizationId: command.organizationId, runId: command.runId });
    if (!run) {
      throw new BenchmarkRunNotFoundError();
    }
    if (isTerminalBenchmarkRunStatus(run.status)) {
      throw new BenchmarkRunNotCancellableError();
    }

    run.requestCancel(command.actorId, this.clock.now());
    await this.benchmarkRunRepository.save(run);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "benchmark_run.cancel_requested",
      resourceType: "benchmark_run",
      resourceId: run.id,
      requestId: command.requestId,
    });

    return toBenchmarkRunSummary(run);
  }
}
