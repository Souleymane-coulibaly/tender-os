import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type SetSavedSearchStatusCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string; enabled: boolean; requestId?: string | undefined }>;

/** Mission §115 — désactiver : plus de nouveaux matches/alertes, jamais de suppression de données. */
@Injectable()
export class SetSavedSearchStatusUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetSavedSearchStatusCommand): Promise<void> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

    const savedSearch = await this.repository.findById({ organizationId: command.organizationId, savedSearchId: command.savedSearchId });
    if (!savedSearch) {
      throw new SavedSearchNotFoundError();
    }
    savedSearch.assertOwnedBy(command.actorId);

    savedSearch.setActive(command.enabled, this.clock.now());
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
  }
}
