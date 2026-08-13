import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { ReclaimStaleAnalysisJobsUseCase } from "../application/use-cases/reclaim-stale-analysis-jobs.use-case";

/**
 * Sprint 21 (hardening) — mission PARTIE F, même motif que `OutboxPublisherWorker`/
 * `WebhookDeliveryWorker` (Sprint 1/16) : poll périodique configurable, arrêt propre. Seuil par
 * défaut volontairement large (10 minutes, très supérieur à `AI_TIMEOUT_MS` par défaut) — ne
 * jamais reprendre un job encore légitimement en cours, uniquement un job réellement abandonné
 * (process crashé) après plusieurs multiples du pire cas de timeout provider normal.
 */
@Injectable()
export class AnalysisJobStaleRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisJobStaleRecoveryWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly reclaimStaleAnalysisJobsUseCase: ReclaimStaleAnalysisJobsUseCase) {}

  onModuleInit(): void {
    if (process.env.ANALYSIS_STALE_RECOVERY_WORKER_ENABLED === "false") {
      this.logger.log("Analysis stale-recovery worker disabled via ANALYSIS_STALE_RECOVERY_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("ANALYSIS_STALE_RECOVERY_POLL_INTERVAL_MS", 5 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Analysis stale-recovery worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Analysis stale-recovery worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const staleThresholdMs = this.readPositiveIntEnv("ANALYSIS_STALE_PROCESSING_THRESHOLD_MS", 10 * 60 * 1000);
      const batchSize = this.readPositiveIntEnv("ANALYSIS_STALE_RECOVERY_BATCH_SIZE", 50);
      const result = await this.reclaimStaleAnalysisJobsUseCase.execute({ staleThresholdMs, batchSize });
      if (result.reclaimed > 0) {
        this.logger.warn(`Analysis stale-recovery tick: reclaimed=${result.reclaimed}`);
        workerJobsTotal.inc({ worker: "analysis_stale_recovery", outcome: "succeeded" }, result.reclaimed);
      }
    } catch (error) {
      this.logger.error("Analysis stale-recovery worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
      workerJobsTotal.inc({ worker: "analysis_stale_recovery", outcome: "failed" });
      workerJobsFailed.inc({ worker: "analysis_stale_recovery" });
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
