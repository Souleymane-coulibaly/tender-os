import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { SendPendingEmailAlertsUseCase } from "../application/use-cases/send-pending-email-alerts.use-case";

/** Mission §66/§67 — worker RÉEL, même motif que les autres (Sprint 1/16/17). Jamais dans la
 *  transaction de matching : lit `SavedSearchMatch.emailStatus = PENDING` posé par
 *  `SyncMarketSourceUseCase`, tente l'envoi, isole les échecs (mission §67 "email down : matching
 *  et in-app doivent continuer" — déjà garanti par construction, ce worker est physiquement
 *  distinct). */
@Injectable()
export class EmailAlertWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailAlertWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly sendPendingEmailAlertsUseCase: SendPendingEmailAlertsUseCase) {}

  onModuleInit(): void {
    if (process.env.EMAIL_ALERT_WORKER_ENABLED === "false") {
      this.logger.log("Email alert worker disabled via EMAIL_ALERT_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("EMAIL_ALERT_POLL_INTERVAL_MS", 5 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Email alert worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Email alert worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const batchSize = this.readPositiveIntEnv("EMAIL_ALERT_BATCH_SIZE", 100);
      const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
      await this.sendPendingEmailAlertsUseCase.execute({ batchSize, baseUrl });
    } catch (error) {
      this.logger.error("Email alert worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
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
