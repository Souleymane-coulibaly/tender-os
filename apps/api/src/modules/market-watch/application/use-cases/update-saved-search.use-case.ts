import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import type { SavedSearch } from "../../domain/saved-search.entity";
import type { SavedSearchCriteriaInput } from "../../domain/services/matching-engine";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

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
 *  `SavedSearch.assertOwnedBy`), même sous un rôle OWNER/ORGANIZATION_ADMIN.
 *
 * Checkpoint TENDEROS-2.1-P2.3-E10 (correctif P1, root cause de "veille configurée ne fait pas
 * apparaître les AO attendus") — `SyncMarketSourceUseCase.execute()` ne réévalue le matching QUE
 * sur les marchés créés/mis à jour PENDANT le cycle en cours (voir son commentaire de classe) :
 * modifier les critères d'une veille EXISTANTE (ajouter un mot-clé, élargir une zone...) ne
 * réévaluait jusqu'ici JAMAIS le backlog déjà connu — seul `CreateSavedSearchUseCase` déclenchait ce
 * backfill, une seule fois, à la création. Un utilisateur qui affinait ses critères après coup ne
 * voyait donc jamais les marchés déjà présents en base qui deviennent pourtant pertinents avec les
 * NOUVEAUX critères, tant qu'aucun futur cycle ne les touchait par ailleurs. Même mécanisme, même
 * discipline best-effort (mission §74 "ne pas déclencher une tempête sans règle" — fenêtre bornée
 * 30 jours/200 marchés, jamais un balayage complet, voir `WATCH_EDIT_NOTIFICATION_POLICY` du
 * rapport E10) : un échec ici ne doit jamais faire échouer la mise à jour de la veille elle-même. */
@Injectable()
export class UpdateSavedSearchUseCase {
  private readonly logger = new Logger(UpdateSavedSearchUseCase.name);

  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
    @Optional() private readonly syncMarketSourceUseCase?: SyncMarketSourceUseCase,
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

    // Correctif P1 E10 (voir le commentaire de classe) — best-effort, jamais bloquant : un échec de
    // backfill ne doit jamais faire échouer la mise à jour de la veille elle-même. Jamais pour une
    // veille désactivée (mission §75 — aucune nouvelle correspondance pour une veille inactive).
    if (this.syncMarketSourceUseCase && savedSearch.isActive) {
      try {
        await this.syncMarketSourceUseCase.backfillMatchesForSavedSearch({ savedSearch, now: this.clock.now() });
      } catch (error) {
        this.logger.warn(`Failed to backfill matches after updating saved search ${savedSearch.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return savedSearch;
  }
}
