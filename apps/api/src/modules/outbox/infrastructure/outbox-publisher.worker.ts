import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { workerJobsFailed, workerJobsTotal } from "../../../shared-kernel/metrics/metrics";
import { PublishPendingOutboxEventsUseCase } from "../application/use-cases/publish-pending-outbox-events.use-case";

/**
 * Correctif audit Codex P1-001 — worker runtime réel : sans lui, un événement écrit dans
 * `outbox_events` restait en base indéfiniment tant que personne n'appelait manuellement
 * `PublishPendingOutboxEventsUseCase` (le use case existait déjà, testé exhaustivement, mais
 * n'était jamais invoqué automatiquement — c'est cet écart que ce worker comble).
 *
 * Contrôlé (`OUTBOX_WORKER_ENABLED=false` le désactive), configurable
 * (`OUTBOX_POLL_INTERVAL_MS`, `OUTBOX_BATCH_SIZE`), observable (log à chaque tick non vide,
 * erreurs journalisées jamais avalées silencieusement), arrêtable proprement
 * (`OnModuleDestroy` — `clearInterval`, attend le tick en cours). Reprise du backlog après un
 * redémarrage : garantie par construction — `claimPendingBatch` interroge l'état réel de la base
 * à chaque tick, aucun état propre au worker n'est perdu à l'arrêt/redémarrage.
 */
@Injectable()
export class OutboxPublisherWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Tick actuellement en vol — attendu par `onModuleDestroy` (Checkpoint E12.3). */
  private currentTick: Promise<void> | undefined;
  private ticking = false;

  constructor(private readonly publishPendingOutboxEventsUseCase: PublishPendingOutboxEventsUseCase) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_WORKER_ENABLED === "false") {
      this.logger.log("Outbox worker disabled via OUTBOX_WORKER_ENABLED=false.");
      return;
    }

    const intervalMs = this.readPositiveIntEnv("OUTBOX_POLL_INTERVAL_MS", 2000);
    this.timer = setInterval(() => {
      // Checkpoint TENDEROS-2.1-P2.3-E12.3 (§4/§7) — le tick en cours est CONSERVÉ pour que
      // `onModuleDestroy` puisse l'attendre : `clearInterval` seul empêche les ticks FUTURS, mais
      // laissait un tick déjà démarré poursuivre ses requêtes Prisma après la fermeture.
      this.currentTick = this.tick();
      void this.currentTick;
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Outbox worker started (interval=${intervalMs}ms).`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    // Aucune nouvelle requête Prisma ne doit partir après le retour de ce hook : le tick déjà
    // démarré est attendu jusqu'à son terme (il absorbe déjà ses propres erreurs, voir `tick`).
    await this.currentTick;
    this.currentTick = undefined;
    this.logger.log("Outbox worker stopped.");
  }

  /** Exposé pour les tests (et un éventuel déclenchement manuel/CLI) — même logique qu'un tick
   *  planifié, sans dépendre d'un vrai minuteur. */
  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const batchSize = this.readPositiveIntEnv("OUTBOX_BATCH_SIZE", 100);
      const staleProcessingThresholdMs = this.readPositiveIntEnv("OUTBOX_STALE_PROCESSING_THRESHOLD_MS", 5 * 60 * 1000);
      const result = await this.publishPendingOutboxEventsUseCase.execute({ batchSize, staleProcessingThresholdMs });
      if (result.claimed > 0) {
        this.logger.log(`Outbox tick: claimed=${result.claimed} published=${result.published} failed=${result.failed} deadLettered=${result.deadLettered}`);
      }
      if (result.published > 0) workerJobsTotal.inc({ worker: "outbox", outcome: "succeeded" }, result.published);
      if (result.failed > 0) {
        workerJobsTotal.inc({ worker: "outbox", outcome: "failed" }, result.failed);
        workerJobsFailed.inc({ worker: "outbox" }, result.failed);
      }
      if (result.deadLettered > 0) workerJobsTotal.inc({ worker: "outbox", outcome: "dead_letter" }, result.deadLettered);
    } catch (error) {
      this.logger.error("Outbox worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
    } finally {
      this.ticking = false;
    }
  }

  private readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
