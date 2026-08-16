import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { SendTrialRemindersUseCase } from "../application/use-cases/send-trial-reminders.use-case";

/** V2 Sprint 25 (Trial Starter) — même squelette que `EmailAlertWorker`/`MarketSourceSyncWorker`
 *  (aucun mécanisme de cron dans ce repo) : `OnModuleInit`/`OnModuleDestroy` + `setInterval`
 *  (`.unref()`'d), garde `ticking` anti-chevauchement, désactivable par variable d'environnement.
 *  Intervalle par défaut d'une heure — largement suffisant pour un jalon exprimé en JOURS
 *  restants (mission §29), jamais "toutes les minutes". */
@Injectable()
export class TrialReminderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrialReminderWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly sendTrialRemindersUseCase: SendTrialRemindersUseCase) {}

  onModuleInit(): void {
    if (process.env.TRIAL_REMINDER_WORKER_ENABLED === "false") {
      this.logger.log("Trial reminder worker disabled via TRIAL_REMINDER_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("TRIAL_REMINDER_POLL_INTERVAL_MS", 60 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Trial reminder worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Trial reminder worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const result = await this.sendTrialRemindersUseCase.execute();
      if (result.remindersSent > 0) {
        workerJobsTotal.inc({ worker: "trial_reminder", outcome: "succeeded" }, result.remindersSent);
      }
    } catch (error) {
      workerJobsFailed.inc({ worker: "trial_reminder" }, 1);
      this.logger.error("Trial reminder worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
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
