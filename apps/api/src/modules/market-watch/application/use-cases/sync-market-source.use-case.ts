import { Inject, Injectable, Logger } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { CreateNotificationUseCase } from "../../../notifications";
import { withSourceRetry } from "../services/with-source-retry";
import { ExternalTender } from "../../domain/external-tender.entity";
import type { SavedSearch } from "../../domain/saved-search.entity";
import { SavedSearchMatch } from "../../domain/saved-search-match.entity";
import { evaluateMatch, type MatchableTender, type MatchReason } from "../../domain/services/matching-engine";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import type { CollectedTender, MarketSourceConnector } from "../ports/market-source-connector";
import { EXTERNAL_TENDER_REPOSITORY, type ExternalTenderRepository } from "../ports/external-tender.repository";
import { SAVED_SEARCH_REPOSITORY, type SavedSearchRepository } from "../ports/saved-search.repository";
import { SAVED_SEARCH_MATCH_REPOSITORY, type SavedSearchMatchRepository } from "../ports/saved-search-match.repository";

export type SyncMarketSourceCommand = Readonly<{ organizationId: string; connector: MarketSourceConnector; batchSize?: number | undefined }>;

export type SyncMarketSourceResult = Readonly<{
  collected: number;
  created: number;
  updated: number;
  unchanged: number;
  matchesCreated: number;
  notificationsCreated: number;
}>;

function toMatchableTender(tender: ExternalTender): MatchableTender {
  return {
    title: tender.title,
    description: tender.description,
    marketType: tender.marketType,
    source: tender.source,
    cpvCodes: tender.cpvCodes,
    country: tender.country,
    region: tender.region,
    department: tender.department,
    city: tender.city,
    estimatedAmount: tender.estimatedAmount,
    publicationDate: tender.publicationDate,
    submissionDeadline: tender.submissionDeadline,
    procedureType: tender.procedureType,
  };
}

/**
 * Mission §5-§12/§26/§57-§64/§65 — le cœur du pipeline : Source -> collecte -> normalisation ->
 * déduplication -> filtres utilisateur -> matching -> opportunités pertinentes -> alertes. Appelé
 * par `MarketSourceSyncWorker` (infrastructure, poll périodique réel, mission §58/§59), jamais un
 * "Refresh" manuel qui ferait office de seule preuve d'automatisation.
 *
 * Chaque marché créé/mis à jour + son `OutboxEvent` sont dans UNE transaction courte (mission §91
 * même motif que Sprint 16) — jamais une transaction unique pour tout le batch (mission §82/§83).
 * Le matching s'exécute uniquement sur le DELTA (marchés créés ou significativement mis à jour
 * cette passe), jamais un balayage complet de la table.
 */
@Injectable()
export class SyncMarketSourceUseCase {
  private readonly logger = new Logger(SyncMarketSourceUseCase.name);

  constructor(
    @Inject(EXTERNAL_TENDER_REPOSITORY) private readonly externalTenderRepository: ExternalTenderRepository,
    @Inject(SAVED_SEARCH_REPOSITORY) private readonly savedSearchRepository: SavedSearchRepository,
    @Inject(SAVED_SEARCH_MATCH_REPOSITORY) private readonly savedSearchMatchRepository: SavedSearchMatchRepository,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly createNotificationUseCase: CreateNotificationUseCase,
  ) {}

  async execute(command: SyncMarketSourceCommand): Promise<SyncMarketSourceResult> {
    const now = this.clock.now();
    // Mission §27 — un timeout/429 transitoire ne doit pas échouer tout le cycle de cette source
    // dès la première tentative (voir `withSourceRetry` pour la justification du dimensionnement,
    // volontairement modeste : le worker rejoue de toute façon toutes les heures).
    const searchResult = await withSourceRetry(() => command.connector.search({ limit: command.batchSize ?? 100 }));

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const touchedTenderIds: string[] = [];

    for (const collected of searchResult.items) {
      const tenderId = await this.upsertOne(command.organizationId, command.connector, collected, now);
      if (tenderId.outcome === "created") {
        created += 1;
        touchedTenderIds.push(tenderId.id);
      } else if (tenderId.outcome === "updated") {
        updated += 1;
        touchedTenderIds.push(tenderId.id);
      } else {
        unchanged += 1;
      }
    }

    let matchesCreated = 0;
    let notificationsCreated = 0;
    if (touchedTenderIds.length > 0) {
      const activeSearches = await this.savedSearchRepository.listActiveByOrganization({ organizationId: command.organizationId });
      for (const tenderId of touchedTenderIds) {
        const tender = await this.externalTenderRepository.findById({ organizationId: command.organizationId, externalTenderId: tenderId });
        if (!tender) continue;
        const matchable = toMatchableTender(tender);

        for (const savedSearch of activeSearches) {
          const evaluation = evaluateMatch(savedSearch.criteria, matchable, now);
          if (!evaluation.matched) continue;

          const outcome = await this.recordMatch(savedSearch.id, savedSearch.organizationId, tender.id, evaluation.score, [...evaluation.reasons], now);
          if (outcome === "created") {
            matchesCreated += 1;
            if (savedSearch.alertInApp) {
              await this.createNotificationAndEmitEvent(command.organizationId, savedSearch.ownerUserId, savedSearch.id, savedSearch.name, tender.id, tender.title, evaluation.score, now);
              notificationsCreated += 1;
            }
          }
        }
      }
    }

    this.logger.log(
      `Market source sync (${command.connector.source}, org ${command.organizationId}): collected=${searchResult.items.length} created=${created} updated=${updated} unchanged=${unchanged} matches=${matchesCreated} notifications=${notificationsCreated}`,
    );

    return { collected: searchResult.items.length, created, updated, unchanged, matchesCreated, notificationsCreated };
  }

  /**
   * Checkpoint TENDEROS-2.1-P2.3-E3, mission §17/§18 — une opportunité déjà connue depuis hier
   * reste "nouvelle" pour une veille qui commence tout juste à la matcher aujourd'hui. Sans ce
   * backfill, `execute()` seul ne réévalue JAMAIS le matching pour un `ExternalTender` inchangé
   * (le matching ne porte que sur le DELTA créé/mis à jour de CE cycle, voir le commentaire de
   * classe) — une veille fraîchement créée ne verrait donc jamais les opportunités déjà en base
   * tant qu'elles ne changent pas côté source. Fenêtre bornée (jamais un balayage complet de la
   * table, même discipline que la fenêtre de fraîcheur par défaut de `TedSourceConnector`).
   * Réutilise exactement `recordMatch`/`createNotificationAndEmitEvent` — même mécanisme
   * idempotent qu'un cycle de sync normal, jamais un second système de matching. Appelé en
   * best-effort par `CreateSavedSearchUseCase` — un échec ici ne doit jamais empêcher la création
   * de la veille elle-même (le prochain cycle planifié rattrapera de toute façon tout DELTA futur).
   */
  async backfillMatchesForSavedSearch(input: { savedSearch: SavedSearch; now: Date }): Promise<{ matchesCreated: number; notificationsCreated: number }> {
    const { savedSearch, now } = input;
    const backfillWindowMs = 30 * 24 * 60 * 60 * 1000;
    const page = await this.externalTenderRepository.list({ organizationId: savedSearch.organizationId, publishedAfter: new Date(now.getTime() - backfillWindowMs), limit: 200 });

    let matchesCreated = 0;
    let notificationsCreated = 0;
    for (const tender of page.items) {
      const evaluation = evaluateMatch(savedSearch.criteria, toMatchableTender(tender), now);
      if (!evaluation.matched) continue;

      const outcome = await this.recordMatch(savedSearch.id, savedSearch.organizationId, tender.id, evaluation.score, [...evaluation.reasons], now);
      if (outcome === "created") {
        matchesCreated += 1;
        if (savedSearch.alertInApp) {
          await this.createNotificationAndEmitEvent(savedSearch.organizationId, savedSearch.ownerUserId, savedSearch.id, savedSearch.name, tender.id, tender.title, evaluation.score, now);
          notificationsCreated += 1;
        }
      }
    }
    return { matchesCreated, notificationsCreated };
  }

  private async upsertOne(organizationId: string, connector: MarketSourceConnector, collected: CollectedTender, now: Date): Promise<{ outcome: "created" | "updated" | "unchanged"; id: string }> {
    return this.atomicTransactionRunner.run(async () => {
      const existing = await this.externalTenderRepository.findBySourceAndExternalId({ organizationId, source: connector.source, externalId: collected.externalId });

      if (!existing) {
        const tender = ExternalTender.create({
          id: this.idGenerator.generate(),
          organizationId,
          source: connector.source,
          marketType: connector.marketType,
          externalId: collected.externalId,
          title: collected.title,
          description: collected.description,
          buyerName: collected.buyerName,
          buyerType: collected.buyerType,
          country: collected.country,
          region: collected.region,
          department: collected.department,
          city: collected.city,
          cpvCodes: [...collected.cpvCodes],
          estimatedAmount: collected.estimatedAmount,
          currency: collected.currency,
          procedureType: collected.procedureType,
          publicationDate: collected.publicationDate,
          submissionDeadline: collected.submissionDeadline,
          sourceUrl: collected.sourceUrl,
          lots: collected.lots ? [...collected.lots] : undefined,
          rawMetadata: collected.rawMetadata,
          occurredAt: now,
        });
        await this.externalTenderRepository.create(tender);
        await this.outboxWriter.write({
          organizationId,
          events: [
            {
              eventType: "external_tender.created",
              aggregateType: "ExternalTender",
              aggregateId: tender.id,
              payload: { externalTenderId: tender.id, source: tender.source, title: tender.title, sourceUrl: tender.sourceUrl },
              occurredAt: now,
            },
          ],
        });
        return { outcome: "created" as const, id: tender.id };
      }

      const changed = existing.applyFetch({
        marketType: existing.marketType,
        title: collected.title,
        description: collected.description,
        buyerName: collected.buyerName,
        buyerType: collected.buyerType,
        country: collected.country,
        region: collected.region,
        department: collected.department,
        city: collected.city,
        cpvCodes: [...collected.cpvCodes],
        estimatedAmount: collected.estimatedAmount,
        currency: collected.currency,
        procedureType: collected.procedureType,
        publicationDate: collected.publicationDate,
        submissionDeadline: collected.submissionDeadline,
        sourceUrl: collected.sourceUrl,
        lots: collected.lots ? [...collected.lots] : undefined,
        rawMetadata: collected.rawMetadata,
        occurredAt: now,
      });
      await this.externalTenderRepository.save(existing);

      if (changed) {
        await this.outboxWriter.write({
          organizationId,
          events: [
            {
              eventType: "external_tender.updated",
              aggregateType: "ExternalTender",
              aggregateId: existing.id,
              payload: { externalTenderId: existing.id, source: existing.source, title: existing.title },
              occurredAt: now,
            },
          ],
        });
        return { outcome: "updated" as const, id: existing.id };
      }
      return { outcome: "unchanged" as const, id: existing.id };
    });
  }

  private async recordMatch(savedSearchId: string, organizationId: string, externalTenderId: string, score: number, matchReasons: MatchReason[], now: Date): Promise<"created" | "existing"> {
    return this.atomicTransactionRunner.run(async () => {
      const match = SavedSearchMatch.create({ id: this.idGenerator.generate(), organizationId, savedSearchId, externalTenderId, score, matchReasons: [...matchReasons], occurredAt: now });
      const isNew = await this.savedSearchMatchRepository.createIfNotExists(match);

      if (isNew) {
        await this.outboxWriter.write({
          organizationId,
          events: [
            {
              eventType: "saved_search.match_found",
              aggregateType: "SavedSearchMatch",
              aggregateId: match.id,
              payload: { savedSearchId, externalTenderId, score },
              occurredAt: now,
            },
          ],
        });
        return "created";
      }

      // Mission §12/§50 — déjà connu : rafraîchit score/raisons (le marché a pu être mis à jour)
      // sans jamais re-déclencher une alerte "nouveau marché" (mission §48).
      const existingMatch = await this.savedSearchMatchRepository.findBySavedSearchAndTender({ organizationId, savedSearchId, externalTenderId });
      if (existingMatch) {
        existingMatch.refreshFromRematch({ score, matchReasons: [...matchReasons], occurredAt: now });
        await this.savedSearchMatchRepository.save(existingMatch);
      }
      return "existing";
    });
  }

  private async createNotificationAndEmitEvent(
    organizationId: string,
    ownerUserId: string,
    savedSearchId: string,
    savedSearchName: string,
    externalTenderId: string,
    tenderTitle: string,
    score: number,
    now: Date,
  ): Promise<void> {
    await this.atomicTransactionRunner.run(async () => {
      const notification = await this.createNotificationUseCase.execute({
        organizationId,
        userId: ownerUserId,
        type: "SAVED_SEARCH_MATCH",
        title: `Nouveau marché : ${tenderTitle}`,
        body: `Correspond à votre veille "${savedSearchName}" (pertinence ${score}%).`,
        targetUrl: `/app/market-watch/${externalTenderId}`,
        metadata: { savedSearchId, externalTenderId, score },
      });
      // Mission §65 — même catalogue Outbox que le reste (Sprint 16), jamais un second système de
      // queue pour ce dernier événement.
      await this.outboxWriter.write({
        organizationId,
        events: [{ eventType: "notification.created", aggregateType: "Notification", aggregateId: notification.id, payload: { userId: ownerUserId, type: notification.type }, occurredAt: now }],
      });
    });
  }
}
