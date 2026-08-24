import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

export type SetSavedSearchStatusCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string; enabled: boolean; requestId?: string | undefined }>;

/** Mission §115 — désactiver : plus de nouveaux matches/alertes, jamais de suppression de données.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E10 (correctif P1, même root cause que `UpdateSavedSearchUseCase` —
 * voir son commentaire de classe) — une veille réactivée après une pause voit désormais aussi son
 * backlog réévalué (best-effort, fenêtre bornée), jamais seulement à sa toute première création. */
@Injectable()
export class SetSavedSearchStatusUseCase {
  private readonly logger = new Logger(SetSavedSearchStatusUseCase.name);

  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Optional() private readonly syncMarketSourceUseCase?: SyncMarketSourceUseCase,
  ) {}

  async execute(command: SetSavedSearchStatusCommand): Promise<void> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

    const savedSearch = await this.repository.findById({ organizationId: command.organizationId, savedSearchId: command.savedSearchId });
    if (!savedSearch) {
      throw new SavedSearchNotFoundError();
    }
    savedSearch.assertOwnedBy(command.actorId);

    const wasActive = savedSearch.isActive;
    const now = this.clock.now();
    savedSearch.setActive(command.enabled, now);
    await this.repository.save(savedSearch);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "SavedSearchDisabled",
      resourceType: "saved_search",
      resourceId: savedSearch.id,
      requestId: command.requestId,
      metadata: { enabled: command.enabled },
    });

    // Correctif P1 E10 — uniquement à la RÉACTIVATION (jamais à la désactivation, jamais si déjà
    // active) : best-effort, jamais bloquant.
    if (this.syncMarketSourceUseCase && command.enabled && !wasActive) {
      try {
        await this.syncMarketSourceUseCase.backfillMatchesForSavedSearch({ savedSearch, now });
      } catch (error) {
        this.logger.warn(`Failed to backfill matches after reactivating saved search ${savedSearch.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
