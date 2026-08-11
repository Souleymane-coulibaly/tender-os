import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { SavedSearch } from "../../domain/saved-search.entity";
import type { SavedSearchCriteriaInput } from "../../domain/services/matching-engine";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type UpdateSavedSearchCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  savedSearchId: string;
  name?: string | undefined;
  clientAccountId?: string | null | undefined;
  criteria?: SavedSearchCriteriaInput | undefined;
  alertInApp?: boolean | undefined;
  alertEmail?: boolean | undefined;
  emailFrequency?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission §17 — jamais modifiable par un autre utilisateur (voir
 *  `SavedSearch.assertOwnedBy`), même sous un rôle OWNER/ORGANIZATION_ADMIN. */
@Injectable()
export class UpdateSavedSearchUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateSavedSearchCommand): Promise<SavedSearch> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

    const savedSearch = await this.repository.findById({ organizationId: command.organizationId, savedSearchId: command.savedSearchId });
    if (!savedSearch) {
      throw new SavedSearchNotFoundError();
    }
    savedSearch.assertOwnedBy(command.actorId);

    if (command.clientAccountId) {
      await this.getClientAccountUseCase.execute({ organizationId: command.organizationId, clientAccountId: command.clientAccountId, actorId: command.actorId, actorRole: command.actorRole });
      await this.assertClientAccessUseCase.execute({
        organizationId: command.organizationId,
        clientAccountId: command.clientAccountId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        permission: ClientPermission.Read,
      });
    }

    savedSearch.update({
      name: command.name,
      clientAccountId: command.clientAccountId,
      criteria: command.criteria,
      alertInApp: command.alertInApp,
      alertEmail: command.alertEmail,
      emailFrequency: command.emailFrequency,
      occurredAt: this.clock.now(),
    });

    await this.repository.save(savedSearch);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "SavedSearchUpdated",
      resourceType: "saved_search",
      resourceId: savedSearch.id,
      requestId: command.requestId,
    });

    return savedSearch;
  }
}
