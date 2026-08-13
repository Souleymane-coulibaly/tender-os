import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { ReclaimStaleGenerationsUseCase } from "../application/use-cases/reclaim-stale-generations.use-case";

/** Sprint 21 (hardening) — mission PARTIE F, même motif que `AnalysisJobStaleRecoveryWorker`. */
@Injectable()
export class GenerationStaleRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GenerationStaleRecoveryWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly reclaimStaleGenerationsUseCase: ReclaimStaleGenerationsUseCase) {}

  onModuleInit(): void {
    if (process.env.GENERATION_STALE_RECOVERY_WORKER_ENABLED === "false") {
      this.logger.log("Generation stale-recovery worker disabled via GENERATION_STALE_RECOVERY_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("GENERATION_STALE_RECOVERY_POLL_INTERVAL_MS", 5 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Generation stale-recovery worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Generation stale-recovery worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const staleThresholdMs = this.readPositiveIntEnv("GENERATION_STALE_THRESHOLD_MS", 10 * 60 * 1000);
      const batchSize = this.readPositiveIntEnv("GENERATION_STALE_RECOVERY_BATCH_SIZE", 50);
      const result = await this.reclaimStaleGenerationsUseCase.execute({ staleThresholdMs, batchSize });
      if (result.reclaimed > 0) {
        this.logger.warn(`Generation stale-recovery tick: reclaimed=${result.reclaimed}`);
        workerJobsTotal.inc({ worker: "generation_stale_recovery", outcome: "succeeded" }, result.reclaimed);
      }
    } catch (error) {
      this.logger.error("Generation stale-recovery worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
      workerJobsTotal.inc({ worker: "generation_stale_recovery", outcome: "failed" });
      workerJobsFailed.inc({ worker: "generation_stale_recovery" });
    } finally {
      this.ticking = false;
    }
  }

  private readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
