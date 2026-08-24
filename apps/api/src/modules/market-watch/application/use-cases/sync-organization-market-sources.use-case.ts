import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { workerJobsFailed, workerJobsTotal } from "../../../../shared-kernel/metrics/metrics";
import { MARKET_SOURCE_CONNECTORS, type MarketSourceConnector } from "../ports/market-source-connector";
import { MARKET_SOURCE_SYNC_LEASE_REPOSITORY, type MarketSourceSyncLeaseRepository } from "../ports/market-source-sync-lease.repository";
import { MARKET_SOURCE_SYNC_RUN_REPOSITORY, type MarketSourceSyncRunRepository } from "../ports/market-source-sync-run.repository";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

export type SyncOrganizationMarketSourcesCommand = Readonly<{ organizationId: string; batchSize?: number | undefined }>;

export type SyncOrganizationMarketSourcesResult = Readonly<{
  collected: number;
  created: number;
  updated: number;
  matchesCreated: number;
  notificationsCreated: number;
}>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E10 — extrait de `MarketSourceSyncWorker.tick()` (inchangé
 * fonctionnellement, seulement relocalisé) : la boucle "pour chaque connecteur, réclamer le bail,
 * tracer le run, exécuter `SyncMarketSourceUseCase`" est le VRAI pipeline de collecte pour UNE
 * organisation, jusqu'ici enfermée dans une classe `infrastructure` (worker), donc inappelable
 * depuis un point d'entrée HTTP sans violer la Clean Architecture (`interfaces` ne doit jamais
 * appeler `infrastructure` directement). Déplacée ici (application) pour que DEUX appelants la
 * partagent réellement — `MarketSourceSyncWorker` (cadence horaire) ET `RunSavedSearchNowUseCase`
 * ("Tester la veille", mission §13.B "SAME WATCH EXECUTION USE CASE", jamais un second pipeline) —
 * sans dupliquer la logique bail/trace ni en créer une variante.
 */
@Injectable()
export class SyncOrganizationMarketSourcesUseCase {
  private readonly logger = new Logger(SyncOrganizationMarketSourcesUseCase.name);

  constructor(
    @Inject(MARKET_SOURCE_CONNECTORS) private readonly connectors: MarketSourceConnector[],
    @Inject(MARKET_SOURCE_SYNC_LEASE_REPOSITORY) private readonly leaseRepository: MarketSourceSyncLeaseRepository,
    @Inject(MARKET_SOURCE_SYNC_RUN_REPOSITORY) private readonly syncRunRepository: MarketSourceSyncRunRepository,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly syncMarketSourceUseCase: SyncMarketSourceUseCase,
  ) {}

  async execute(command: SyncOrganizationMarketSourcesCommand): Promise<SyncOrganizationMarketSourcesResult> {
    const batchSize = command.batchSize ?? this.readPositiveIntEnv("MARKET_SOURCE_SYNC_BATCH_SIZE", 100);
    const leaseDurationMs = this.readPositiveIntEnv("MARKET_SOURCE_SYNC_LEASE_DURATION_MS", 10 * 60 * 1000);

    let collected = 0;
    let created = 0;
    let updated = 0;
    let matchesCreated = 0;
    let notificationsCreated = 0;

    for (const connector of this.connectors) {
      const now = this.clock.now();
      // Mission §53/§92 — même bail que le worker planifié : un déclenchement manuel ("Tester la
      // veille") qui coïncide avec un tick automatique pour LE MÊME (organisation, source) ne double
      // jamais l'appel réseau au fournisseur ; il cède simplement la main au détenteur du bail (le
      // pipeline reste sûr même sans lui, voir `SyncMarketSourceUseCase`/`SavedSearchMatch` unique
      // constraint, mais le bail évite un appel HTTP externe redondant).
      const claimed = await this.leaseRepository.tryClaim({ organizationId: command.organizationId, source: connector.source, now, leaseDurationMs });
      if (!claimed) {
        this.logger.debug(`Skipping market source sync (source=${connector.source}, org=${command.organizationId}): lease already held by another instance.`);
        continue;
      }

      const runId = this.idGenerator.generate();
      const runStartedAt = new Date();
      try {
        await this.syncRunRepository.start({ id: runId, organizationId: command.organizationId, source: connector.source, startedAt: runStartedAt });
      } catch (error) {
        this.logger.warn(`Failed to record market source sync run start (source=${connector.source}, org=${command.organizationId}): ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const result = await this.syncMarketSourceUseCase.execute({ organizationId: command.organizationId, connector, batchSize });
        collected += result.collected;
        created += result.created;
        updated += result.updated;
        matchesCreated += result.matchesCreated;
        notificationsCreated += result.notificationsCreated;
        workerJobsTotal.inc({ worker: "market_source_sync", outcome: "succeeded" });
        await this.completeRunQuietly({
          id: runId,
          finishedAt: new Date(),
          status: "SUCCEEDED",
          opportunitiesFetched: result.collected,
          opportunitiesCreated: result.created,
          opportunitiesUpdated: result.updated,
          matchesCreated: result.matchesCreated,
          notificationsCreated: result.notificationsCreated,
        });
      } catch (error) {
        // Mission §55/§62 — une source en échec n'empêche jamais les autres de continuer.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Market source sync failed (source=${connector.source}, org=${command.organizationId}): ${message}`);
        workerJobsTotal.inc({ worker: "market_source_sync", outcome: "failed" });
        workerJobsFailed.inc({ worker: "market_source_sync" });
        await this.completeRunQuietly({
          id: runId,
          finishedAt: new Date(),
          status: "FAILED",
          opportunitiesFetched: 0,
          opportunitiesCreated: 0,
          opportunitiesUpdated: 0,
          matchesCreated: 0,
          notificationsCreated: 0,
          errorSummary: message.slice(0, 500),
        });
      }
    }

    return { collected, created, updated, matchesCreated, notificationsCreated };
  }

  private readPositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async completeRunQuietly(input: Parameters<MarketSourceSyncRunRepository["complete"]>[0]): Promise<void> {
    try {
      await this.syncRunRepository.complete(input);
    } catch (error) {
      this.logger.warn(`Failed to record market source sync run completion (id=${input.id}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
