import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { MARKET_SOURCE_CONNECTORS, type MarketSourceConnector } from "../application/ports/market-source-connector";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../application/ports/saved-search.repository";
import { SyncMarketSourceUseCase } from "../application/use-cases/sync-market-source.use-case";

/**
 * Mission §57/§58/§59/§60 — worker RÉEL, même motif que `OutboxPublisherWorker`/
 * `WebhookDeliveryWorker` (Sprint 1/16) : poll périodique configurable, arrêt propre, jamais un
 * bouton "Refresh" manuel comme seule preuve d'automatisation (mission §59). N'interroge une
 * source QUE pour les organisations ayant une veille active (mission §60/§82 — jamais un balayage
 * inutile). Une source en échec (mission §62) n'empêche jamais les autres de continuer.
 */
@Injectable()
export class MarketSourceSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketSourceSyncWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    @Inject(MARKET_SOURCE_CONNECTORS) private readonly connectors: MarketSourceConnector[],
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    private readonly syncMarketSourceUseCase: SyncMarketSourceUseCase,
  ) {}

  onModuleInit(): void {
    if (process.env.MARKET_SOURCE_SYNC_WORKER_ENABLED === "false") {
      this.logger.log("Market source sync worker disabled via MARKET_SOURCE_SYNC_WORKER_ENABLED=false.");
      return;
    }

    // Mission §60/§61 — fréquence raisonnable, jamais toutes les minutes (rate limits sources
    // tierces) : défaut 1h, configurable.
    const intervalMs = this.readPositiveIntEnv("MARKET_SOURCE_SYNC_POLL_INTERVAL_MS", 60 * 60 * 1000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`Market source sync worker started (interval=${intervalMs}ms, connectors=${this.connectors.map((c) => c.source).join(",")}).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Market source sync worker stopped.");
    }
  }

  /** Exposé pour les tests et un déclenchement manuel admin protégé (mission §64) — même logique
   *  qu'un tick planifié. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const organizationIds = await this.savedSearchRepository.listDistinctOrganizationIdsWithActiveSearches();
      const batchSize = this.readPositiveIntEnv("MARKET_SOURCE_SYNC_BATCH_SIZE", 100);

      for (const organizationId of organizationIds) {
        for (const connector of this.connectors) {
          try {
            await this.syncMarketSourceUseCase.execute({ organizationId, connector, batchSize });
          } catch (error) {
            // Mission §62 — une source en échec n'empêche jamais les autres de continuer.
            this.logger.warn(`Market source sync failed (source=${connector.source}, org=${organizationId}): ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
    } catch (error) {
      this.logger.error("Market source sync worker tick failed unexpectedly.", error instanceof Error ? error.stack : String(error));
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
