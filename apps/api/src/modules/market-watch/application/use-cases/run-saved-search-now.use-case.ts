import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { SavedSearchMatchStatus } from "../../domain/enums";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { assertHasMarketWatchPermission, MarketWatchPermission } from "../../domain/market-watch-permission";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../ports/saved-search-match.repository";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";
import { SyncOrganizationMarketSourcesUseCase } from "./sync-organization-market-sources.use-case";

export type RunSavedSearchNowCommand = Readonly<{ organizationId: string; actorId: string; actorRole: string; savedSearchId: string; requestId?: string | undefined }>;

export type RunSavedSearchNowResult = Readonly<{ matchesFound: number }>;

/**
 * Checkpoint TENDEROS-2.1-P2.3-E10, mission §13.B-§13.H ("Tester la veille") — permet une première
 * recherche immédiate sans attendre le prochain cycle horaire, en appelant EXACTEMENT le même
 * pipeline que le scheduler automatique (`SyncOrganizationMarketSourcesUseCase`, mission §13.B
 * "SAME WATCH EXECUTION USE CASE") — jamais un `ManualWatchEngine`/`TestWatchEngine` séparé.
 *
 * Deux étapes, toutes deux déjà réelles et idempotentes ailleurs, jamais une troisième inventée ici :
 *   1. `SyncOrganizationMarketSourcesUseCase.execute` — collecte fraîche pour TOUTE l'organisation
 *      (mission §13.C.7 "synchroniser/lire les sources selon l'architecture existante" — le sync
 *      reste centralisé par organisation, jamais par veille individuelle, voir son commentaire de
 *      classe) : peut faire apparaître de VRAIS nouveaux marchés pour n'importe quelle veille active
 *      de l'organisation, cette veille comprise.
 *   2. `SyncMarketSourceUseCase.backfillMatchesForSavedSearch` — réévalue CETTE veille précisément
 *      contre le backlog déjà connu (fenêtre 30 jours/200 marchés, même mécanisme que la création
 *      d'une veille) : capture les correspondances déjà présentes en base mais jamais encore
 *      matchées pour CETTE veille (mission §7 "édition de critères" / §8 "réactivation").
 * Idempotent par construction (mission §13.H) : les deux étapes réutilisent `recordMatch`
 * (contrainte unique `(savedSearchId, externalTenderId)`) — un second clic sans nouveau marché ne
 * crée ni doublon d'`ExternalTender`, ni de `SavedSearchMatch`, ni de notification/email.
 *
 * `matchesFound` (mission §13.D "afficher le nombre réellement retourné par le backend, jamais un
 * nombre fabriqué") — ni le résultat agrégé de l'étape 1 (toutes les veilles actives de
 * l'organisation, pas seulement celle-ci) ni celui de l'étape 2 seule (ne verrait pas un marché déjà
 * capturé par l'étape 1 pour CETTE veille) ne donnent isolément le bon chiffre : delta avant/après
 * du nombre de matches NEW pour CETTE veille précisément, seule mesure exacte des deux étapes
 * combinées.
 */
@Injectable()
export class RunSavedSearchNowUseCase {
  constructor(
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly repository: SavedSearchRepository,
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly matchRepository: SavedSearchMatchRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly syncOrganizationMarketSourcesUseCase: SyncOrganizationMarketSourcesUseCase,
    private readonly syncMarketSourceUseCase: SyncMarketSourceUseCase,
  ) {}

  async execute(command: RunSavedSearchNowCommand): Promise<RunSavedSearchNowResult> {
    // Mission §13.C.2/§13.C.3 — RBAC (E6, jamais réimplémenté) ; aucun entitlement Market Watch
    // dédié n'existe à ce jour (audit E10 : la Veille est disponible sur tous les paliers payants,
    // même socle que le "cœur métier" documenté dans le catalogue Billing E8 — jamais un
    // `if (plan === ...)` inventé ici).
    assertHasMarketWatchPermission(command.actorRole, MarketWatchPermission.ManageSavedSearch);

    // Mission §13.C.4/§13.C.5 — l'organisation ET la propriété de la veille sont vérifiées avant
    // toute exécution, même garde que `UpdateSavedSearchUseCase`/`SetSavedSearchStatusUseCase`.
    const savedSearch = await this.repository.findById({ organizationId: command.organizationId, savedSearchId: command.savedSearchId });
    if (!savedSearch) {
      throw new SavedSearchNotFoundError();
    }
    savedSearch.assertOwnedBy(command.actorId);

    // Mission §75 — une veille désactivée ne doit plus produire de nouvelles correspondances : le
    // test manuel respecte la même règle, jamais un moyen de contourner la désactivation.
    if (!savedSearch.isActive) {
      throw new SavedSearchNotFoundError();
    }

    const before = await this.countNewMatches(command.organizationId, command.savedSearchId);

    // Étape 1 — même pipeline que le scheduler horaire (mission §13.B), pour TOUTE l'organisation.
    await this.syncOrganizationMarketSourcesUseCase.execute({ organizationId: command.organizationId });

    // Étape 2 — réévalue CETTE veille contre le backlog connu.
    const now = this.clock.now();
    await this.syncMarketSourceUseCase.backfillMatchesForSavedSearch({ savedSearch, now });

    const after = await this.countNewMatches(command.organizationId, command.savedSearchId);
    const matchesFound = Math.max(0, after - before);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorType: "USER",
      actorId: command.actorId,
      action: "SavedSearchRunNow",
      resourceType: "saved_search",
      resourceId: savedSearch.id,
      requestId: command.requestId,
      metadata: { matchesFound },
    });

    return { matchesFound };
  }

  private async countNewMatches(organizationId: string, savedSearchId: string): Promise<number> {
    const counts = await this.matchRepository.countByStatus({ organizationId, savedSearchIds: [savedSearchId], status: SavedSearchMatchStatus.New });
    return counts[savedSearchId] ?? 0;
  }
}
