import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type DeleteSavedSearchCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string; requestId?: string | undefined }>;

/** Mission §114 — soft delete, jamais les ExternalTenders/Matches associés. */
@Injectable()
export class DeleteSavedSearchUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: DeleteSavedSearchCommand): Promise<void> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

    const savedSearch = await this.repository.findById({ organizationId: command.organizationId, savedSearchId: command.savedSearchId });
    if (!savedSearch) {
      throw new SavedSearchNotFoundError();
    }
    savedSearch.assertOwnedBy(command.actorId);

    savedSearch.softDelete(this.clock.now());
    await this.repository.save(savedSearch);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "SavedSearchDeleted",
      resourceType: "saved_search",
      resourceId: savedSearch.id,
      requestId: command.requestId,
    });
  }
}
