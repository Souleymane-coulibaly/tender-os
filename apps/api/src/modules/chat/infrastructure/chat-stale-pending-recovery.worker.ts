import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { ReclaimStalePendingMessagesUseCase } from "../application/use-cases/reclaim-stale-pending-messages.use-case";

/** Sprint 21 (hardening) — mission PARTIE F, même motif que `AnalysisJobStaleRecoveryWorker`. Seuil
 *  par défaut plus court (2 minutes) qu'Analysis/Generation — Chat est un aller-retour HTTP
 *  synchrone, jamais un traitement long ; un dépassement de quelques secondes du timeout provider
 *  (`AI_TIMEOUT_MS`) suffit à qualifier une réservation d'abandonnée. */
@Injectable()
export class ChatStalePendingRecoveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatStalePendingRecoveryWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly reclaimStalePendingMessagesUseCase: ReclaimStalePendingMessagesUseCase) {}

  onModuleInit(): void {
    if (process.env.CHAT_STALE_RECOVERY_WORKER_ENABLED === "false") {
      this.logger.log("Chat stale-recovery worker disabled via CHAT_STALE_RECOVERY_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("CHAT_STALE_RECOVERY_POLL_INTERVAL_MS", 2 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Chat stale-recovery worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Chat stale-recovery worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const staleThresholdMs = this.readPositiveIntEnv("CHAT_STALE_PENDING_THRESHOLD_MS", 2 * 60 * 1000);
      const batchSize = this.readPositiveIntEnv("CHAT_STALE_RECOVERY_BATCH_SIZE", 50);
      const result = await this.reclaimStalePendingMessagesUseCase.execute({ staleThresholdMs, batchSize });
      if (result.reclaimed > 0) {
        this.logger.warn(`Chat stale-recovery tick: reclaimed=${result.reclaimed}`);
        workerJobsTotal.inc({ worker: "chat_stale_recovery", outcome: "succeeded" }, result.reclaimed);
      }
    } catch (error) {
      this.logger.error("Chat stale-recovery worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
      workerJobsTotal.inc({ worker: "chat_stale_recovery", outcome: "failed" });
      workerJobsFailed.inc({ worker: "chat_stale_recovery" });
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
