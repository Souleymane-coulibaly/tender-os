import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AI_BENCHMARK_CONFIG, type AiBenchmarkConfig } from "../../infrastructure/ai-benchmark-config";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { BENCHMARK_RUN_DISPATCHER, type BenchmarkRunDispatcher } from "../ports/benchmark-run-dispatcher";
import { BENCHMARK_RUN_REPOSITORY, type BenchmarkRunRepository } from "../ports/benchmark-run.repository";

const STALE_RUN_ERROR_CODE = "BENCHMARK_RUN_STALE_TIMEOUT";

export type RecoverStaleBenchmarkRunsResult = Readonly<{ retried: number; exhausted: number }>;

/**
 * Audit Codex P1-3 — récupération déterministe des runs restés RUNNING trop longtemps
 * (crash/redéploiement présumé du dispatcher en mémoire). Volontairement simple (mission
 * "ne construis pas une queue distribuée complexe si ce n'est pas nécessaire") : un sweep unique,
 * appelé au démarrage de l'application (`AiBenchmarkModule.onModuleInit`) — pas de scheduler cron,
 * pas de worker séparé. Chaque run stale est traité isolément : une erreur sur l'un ne doit jamais
 * empêcher la récupération des autres (même discipline que `ExecuteBenchmarkRunUseCase` pour les
 * tentatives individuelles).
 *
 * Idempotent par construction : `ExecuteBenchmarkRunUseCase` (ré-invoqué via le dispatcher pour
 * tout run remis en PENDING) ignore déjà toute tentative dont un résultat existe — un run repris
 * plusieurs fois ne duplique donc jamais un résultat ni un coût.
 */
@Injectable()
export class RecoverStaleBenchmarkRunsUseCase {
  private readonly logger = new Logger(RecoverStaleBenchmarkRunsUseCase.name);

  constructor(
    @Inject(BENCHMARK_RUN_REPOSITORY) private readonly benchmarkRunRepository: BenchmarkRunRepository,
    @Inject(BENCHMARK_RUN_DISPATCHER) private readonly dispatcher: BenchmarkRunDispatcher,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(AI_BENCHMARK_CONFIG) private readonly config: AiBenchmarkConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<RecoverStaleBenchmarkRunsResult> {
    const updatedBefore = new Date(this.clock.now().getTime() - this.config.staleRunTimeoutMs);
    const staleRuns = await this.benchmarkRunRepository.listStaleRunning({ updatedBefore });

    let retried = 0;
    let exhausted = 0;

    for (const run of staleRuns) {
      try {
        const outcome = run.recoverFromStale({
          occurredAt: this.clock.now(),
          errorCode: STALE_RUN_ERROR_CODE,
          maxAttempts: this.config.maxStaleRecoveryAttempts,
        });
        await this.benchmarkRunRepository.save(run);

        await this.auditLogWriter.record({
          organizationId: run.organizationId,
          actorType: "SYSTEM",
          action: outcome === "retried" ? "benchmark_run.stale_recovery_retried" : "benchmark_run.stale_recovery_exhausted",
          resourceType: "benchmark_run",
          resourceId: run.id,
          metadata: { staleRecoveryAttempts: run.staleRecoveryAttempts, errorCode: STALE_RUN_ERROR_CODE },
        });

        if (outcome === "retried") {
          retried += 1;
          this.dispatcher.dispatch({ organizationId: run.organizationId, runId: run.id });
        } else {
          exhausted += 1;
          this.logger.warn(`Benchmark run ${run.id} exhausted its stale-recovery attempts (${run.staleRecoveryAttempts}) — marked FAILED.`);
        }
      } catch (error) {
        this.logger.error(
          `Stale-recovery failed for benchmark run ${run.id}, left as-is for the next sweep: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return { retried, exhausted };
  }
}
