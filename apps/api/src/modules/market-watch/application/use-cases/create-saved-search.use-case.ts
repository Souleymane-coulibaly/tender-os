import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { SavedSearch } from "../../domain/saved-search.entity";
import type { SavedSearchCriteriaInput } from "../../domain/services/matching-engine";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";

export type CreateSavedSearchCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  clientAccountId?: string | undefined;
  name: string;
  criteria?: SavedSearchCriteriaInput | undefined;
  alertInApp?: boolean | undefined;
  alertEmail?: boolean | undefined;
  emailFrequency?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission §15/§18/§70 — un utilisateur crée toujours SA PROPRE veille (`ownerUserId` = acteur
 *  courant, jamais un paramètre arbitraire). Si `clientAccountId` est renseigné, ClientAccess
 *  gouverne (mission §19/§71) — jamais un élargissement (mission §18). */
@Injectable()
export class CreateSavedSearchUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateSavedSearchCommand): Promise<SavedSearch> {
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

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

    const occurredAt = this.clock.now();
    const savedSearch = SavedSearch.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      ownerUserId: command.actorId,
      clientAccountId: command.clientAccountId,
      name: command.name,
      criteria: command.criteria,
      alertInApp: command.alertInApp,
      alertEmail: command.alertEmail,
      emailFrequency: command.emailFrequency,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.repository.create(savedSearch);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "SavedSearchCreated",
      resourceType: "saved_search",
      resourceId: savedSearch.id,
      requestId: command.requestId,
      metadata: { name: savedSearch.name, clientAccountId: savedSearch.clientAccountId },
    });

    return savedSearch;
  }
}
