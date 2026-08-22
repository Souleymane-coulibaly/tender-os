/**
 * Checkpoint TENDEROS-2.1-P2.3-E3, mission §28 (OBSERVABILITÉ) — persiste ce que
 * `MarketSourceSyncWorker` savait déjà mais ne laissait auparavant qu'en `Logger.log` transitoire
 * (jamais interrogeable après coup). Granularité (organizationId, source), l'unité d'exécution
 * réelle du pipeline aujourd'hui (voir `schema.prisma`, modèle `MarketSourceSyncRun`) — jamais par
 * veille individuelle, ce qui ne correspondrait à aucune exécution réelle.
 *
 * `start()`/`complete()` plutôt qu'un entity+save générique : l'usage réel est linéaire
 * (créer au début du tick, compléter à la fin, jamais de lecture/mise à jour intermédiaire), même
 * discipline de simplicité que `MarketSourceSyncLeaseRepository.tryClaim`.
 */
export type MarketSourceSyncRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export interface MarketSourceSyncRunRepository {
  start(input: { id: string; organizationId: string; source: string; startedAt: Date }): Promise<void>;

  complete(input: {
    id: string;
    finishedAt: Date;
    status: Exclude<MarketSourceSyncRunStatus, "RUNNING">;
    opportunitiesFetched: number;
    opportunitiesCreated: number;
    opportunitiesUpdated: number;
    matchesCreated: number;
    notificationsCreated: number;
    errorSummary?: string | undefined;
  }): Promise<void>;
}

export const MARKET_SOURCE_SYNC_RUN_REPOSITORY = Symbol("MARKET_SOURCE_SYNC_RUN_REPOSITORY");
