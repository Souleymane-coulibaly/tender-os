import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../application/ports/saved-search.repository";
import { SyncOrganizationMarketSourcesUseCase } from "../application/use-cases/sync-organization-market-sources.use-case";

/**
 * Mission §57/§58/§59/§60 — worker RÉEL, même motif que `OutboxPublisherWorker`/
 * `WebhookDeliveryWorker` (Sprint 1/16) : poll périodique configurable, arrêt propre, jamais un
 * bouton "Refresh" manuel comme seule preuve d'automatisation (mission §59). N'interroge une
 * source QUE pour les organisations ayant une veille active (mission §60/§82 — jamais un balayage
 * inutile). Une source en échec (mission §62) n'empêche jamais les autres de continuer.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E10 — la boucle "par connecteur : bail, trace, exécution" a été
 * extraite vers `SyncOrganizationMarketSourcesUseCase` (application), pour que "Tester la veille"
 * (mission §13.B, `RunSavedSearchNowUseCase`) appelle EXACTEMENT le même pipeline qu'un tick
 * planifié, jamais un second chemin. Ce worker reste le SEUL déclencheur automatique/horaire —
 * simple boucle par organisation éligible, comportement inchangé.
 */
@Injectable()
export class MarketSourceSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketSourceSyncWorker.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;

  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    private readonly syncOrganizationMarketSourcesUseCase: SyncOrganizationMarketSourcesUseCase,
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
    this.logger.log(`Market source sync worker started (interval=${intervalMs}ms).`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log("Market source sync worker stopped.");
    }
  }

  /** Exposé pour les tests et un déclenchement manuel admin protégé (mission §64) — même logique
   *  qu'un tick planifié : délègue à `SyncOrganizationMarketSourcesUseCase` pour chaque organisation
   *  éligible (mission §60/§82 — jamais un balayage inutile des organisations sans veille active). */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const organizationIds = await this.savedSearchRepository.listDistinctOrganizationIdsWithActiveSearches();
      for (const organizationId of organizationIds) {
        await this.syncOrganizationMarketSourcesUseCase.execute({ organizationId });
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
