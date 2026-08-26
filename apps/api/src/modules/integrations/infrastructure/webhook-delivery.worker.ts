import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../shared-kernel/clock";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { WEBHOOK_DELIVERY_REPOSITORY, type WebhookDeliveryRepository } from "../application/ports/webhook-delivery.repository";
import { WebhookDeliveryStatus } from "../domain/enums";
import { DeliverWebhookService } from "./deliver-webhook.service";

/**
 * Mission §36/§39/§93/§94/§120/§121/§122 — worker réel, même motif que `OutboxPublisherWorker`
 * (Sprint 1) : poll périodique configurable, arrêt propre, jamais dans la transaction métier.
 * Traite chaque delivery claimée SÉQUENTIELLEMENT dans un tick (mission ne prescrit aucun
 * parallélisme intra-tick ; un batch borné + tick fréquent suffit à l'échelle visée, jamais un
 * pool de connexions sortantes non maîtrisé vers des tiers).
 */
@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Tick actuellement en vol — attendu par `onModuleDestroy` (Checkpoint E12.3, §8). */
  private currentTick: Promise<void> | undefined;
  private ticking = false;

  constructor(
    @Inject(WEBHOOK_DELIVERY_REPOSITORY) private readonly repository: WebhookDeliveryRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly deliverWebhookService: DeliverWebhookService,
  ) {}

  onModuleInit(): void {
    if (process.env.WEBHOOK_DELIVERY_WORKER_ENABLED === "false") {
      this.logger.log("Webhook delivery worker disabled via WEBHOOK_DELIVERY_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("WEBHOOK_DELIVERY_POLL_INTERVAL_MS", 2000);
    this.timer = setInterval(() => {
      // Checkpoint TENDEROS-2.1-P2.3-E12.3 (§8) — même contrat que `OutboxPublisherWorker` : le tick
      // en vol est conservé pour être attendu à l'arrêt, afin qu'aucune requête Prisma (ni aucune
      // livraison HTTP sortante) ne parte après la fermeture ("Engine is not yet connected").
      this.currentTick = this.tick();
      void this.currentTick;
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Webhook delivery worker started (interval=${intervalMs}ms).`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.currentTick;
    this.currentTick = undefined;
    this.logger.log("Webhook delivery worker stopped.");
  }

  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const batchSize = this.readPositiveIntEnv("WEBHOOK_DELIVERY_BATCH_SIZE", 50);
      const staleDeliveringThresholdMs = this.readPositiveIntEnv("WEBHOOK_DELIVERY_STALE_THRESHOLD_MS", 5 * 60 * 1000);
      const now = this.clock.now();
      const claimed = await this.repository.claimPendingBatch({ limit: batchSize, now, staleDeliveringThresholdMs });

      if (claimed.length === 0) {
        return;
      }

      let succeeded = 0;
      let failed = 0;
      for (const delivery of claimed) {
        try {
          await this.deliverWebhookService.deliver(delivery);
          if (delivery.status === WebhookDeliveryStatus.Succeeded) succeeded += 1;
          else failed += 1;
        } catch (error) {
          failed += 1;
          this.logger.error(`Unexpected error delivering webhook ${delivery.id}`, error instanceof Error ? error.stack : String(error));
        }
      }
      this.logger.log(`Webhook delivery tick: claimed=${claimed.length} succeeded=${succeeded} failed=${failed}`);
      if (succeeded > 0) workerJobsTotal.inc({ worker: "webhook_delivery", outcome: "succeeded" }, succeeded);
      if (failed > 0) {
        workerJobsTotal.inc({ worker: "webhook_delivery", outcome: "failed" }, failed);
        workerJobsFailed.inc({ worker: "webhook_delivery" }, failed);
      }
    } catch (error) {
      this.logger.error("Webhook delivery worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
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
