import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { GrantMonthlyAoCreditsForYearlySubscriptionsUseCase } from "../application/use-cases/grant-monthly-ao-credits-for-yearly-subscriptions.use-case";

/** Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 2 — même squelette que `TrialReminderWorker`/
 *  `EmailAlertWorker`/`MarketSourceSyncWorker` (aucun mécanisme de cron dans ce dépôt, audité) :
 *  `OnModuleInit`/`OnModuleDestroy` + `setInterval` (`.unref()`'d), garde `ticking`
 *  anti-chevauchement, désactivable par variable d'environnement. Intervalle par défaut d'une heure
 *  — largement suffisant pour un mécanisme dont la clé d'idempotence est le MOIS CALENDAIRE, jamais
 *  "toutes les minutes" (le grant lui-même est un no-op pour tout tick déjà couvert ce mois-ci). */
@Injectable()
export class MonthlyAoCreditGrantWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonthlyAoCreditGrantWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(private readonly grantMonthlyAoCreditsForYearlySubscriptionsUseCase: GrantMonthlyAoCreditsForYearlySubscriptionsUseCase) {}

  onModuleInit(): void {
    if (process.env.MONTHLY_AO_CREDIT_GRANT_WORKER_ENABLED === "false") {
      this.logger.log("Monthly AO credit grant worker disabled via MONTHLY_AO_CREDIT_GRANT_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("MONTHLY_AO_CREDIT_GRANT_POLL_INTERVAL_MS", 60 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Monthly AO credit grant worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Monthly AO credit grant worker stopped.");
    }
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const result = await this.grantMonthlyAoCreditsForYearlySubscriptionsUseCase.execute();
      if (result.periodsGranted > 0) {
        workerJobsTotal.inc({ worker: "monthly_ao_credit_grant", outcome: "succeeded" }, result.periodsGranted);
      }
    } catch (error) {
      workerJobsFailed.inc({ worker: "monthly_ao_credit_grant" }, 1);
      this.logger.error("Monthly AO credit grant worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
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
