import type { Clock } from "../../../shared-kernel/clock";
import type { IdGenerator } from "../../../shared-kernel/id-generator";
import type { OutboxEventInput, OutboxWriter } from "../../outbox";
import type { EmailMessage, EmailProvider } from "../../notifications";
import type { CollectedTender, MarketSourceConnector, MarketSourceSearchCriteria, MarketSourceSearchResult } from "../application/ports/market-source-connector";
import type { ExternalTenderListFilter, ExternalTenderPage, ExternalTenderRepository } from "../application/ports/external-tender.repository";
import type { SavedSearchRepository } from "../application/ports/saved-search.repository";
import type { SavedSearchMatchRepository } from "../application/ports/saved-search-match.repository";
import type { ExternalTender } from "../domain/external-tender.entity";
import type { SavedSearch } from "../domain/saved-search.entity";
import type { SavedSearchMatch } from "../domain/saved-search-match.entity";

/** Fakes de test partagés — même motif que `integrations/test-support` (Sprint 16). Le connecteur
 *  "en mémoire" ci-dessous joue le rôle de l'adaptateur CUSTOM/test (décision Sprint 17) : preuve
 *  déterministe de la chaîne worker -> connecteur -> normalisation -> matching -> alerte, sans
 *  dépendre de la disponibilité/du contenu changeant de l'API BOAMP réelle. `BoampSourceConnector`
 *  reste testé séparément contre la vraie API (mission §134 "démontrer collecte automatique").
 */
export class FakeMarketSourceConnector implements MarketSourceConnector {
  constructor(
    readonly source: string,
    readonly marketType: string,
    private items: CollectedTender[] = [],
  ) {}

  setItems(items: CollectedTender[]): void {
    this.items = items;
  }

  async search(_criteria: MarketSourceSearchCriteria): Promise<MarketSourceSearchResult> {
    return { items: this.items, nextCursor: null };
  }
}

export class FixedClock implements Clock {
  constructor(private value: Date = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return this.value;
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;
  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class InMemoryOutboxWriter implements OutboxWriter {
  readonly events: (OutboxEventInput & { organizationId: string })[] = [];
  async write(input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    this.events.push(...input.events.map((event) => ({ ...event, organizationId: input.organizationId })));
  }
}

export class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  shouldFail = false;
  async send(message: EmailMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error("FakeEmailProvider: forced failure");
    }
    this.sent.push(message);
  }
}

export class InMemoryExternalTenderRepository implements ExternalTenderRepository {
  readonly tenders: ExternalTender[] = [];
  async create(tender: ExternalTender): Promise<void> {
    this.tenders.push(tender);
  }
  async save(tender: ExternalTender): Promise<void> {
    const index = this.tenders.findIndex((t) => t.id === tender.id);
    if (index === -1) this.tenders.push(tender);
    else this.tenders[index] = tender;
  }
  async findBySourceAndExternalId(input: { organizationId: string; source: string; externalId: string }): Promise<ExternalTender | null> {
    return this.tenders.find((t) => t.organizationId === input.organizationId && t.source === input.source && t.externalId === input.externalId) ?? null;
  }
  async findById(input: { organizationId: string; externalTenderId: string }): Promise<ExternalTender | null> {
    return this.tenders.find((t) => t.id === input.externalTenderId && t.organizationId === input.organizationId) ?? null;
  }
  async findManyByIds(input: { organizationId: string; externalTenderIds: readonly string[] }): Promise<ExternalTender[]> {
    return this.tenders.filter((t) => t.organizationId === input.organizationId && input.externalTenderIds.includes(t.id));
  }
  async list(filter: ExternalTenderListFilter): Promise<ExternalTenderPage> {
    const items = this.tenders.filter((t) => t.organizationId === filter.organizationId).slice(0, filter.limit);
    return { items, nextCursor: null };
  }
}

export class InMemorySavedSearchRepository implements SavedSearchRepository {
  readonly searches: SavedSearch[] = [];
  async create(search: SavedSearch): Promise<void> {
    this.searches.push(search);
  }
  async save(search: SavedSearch): Promise<void> {
    const index = this.searches.findIndex((s) => s.id === search.id);
    if (index === -1) this.searches.push(search);
    else this.searches[index] = search;
  }
  async findById(input: { organizationId: string; savedSearchId: string }): Promise<SavedSearch | null> {
    return this.searches.find((s) => s.id === input.savedSearchId && s.organizationId === input.organizationId) ?? null;
  }
  async listByOwner(input: { organizationId: string; ownerUserId: string }): Promise<SavedSearch[]> {
    return this.searches.filter((s) => s.organizationId === input.organizationId && s.ownerUserId === input.ownerUserId && s.deletedAt === undefined);
  }
  async listActiveByOrganization(input: { organizationId: string }): Promise<SavedSearch[]> {
    return this.searches.filter((s) => s.organizationId === input.organizationId && s.isActive);
  }
  async listDistinctOrganizationIdsWithActiveSearches(): Promise<string[]> {
    return [...new Set(this.searches.filter((s) => s.isActive).map((s) => s.organizationId))];
  }
}

export class InMemorySavedSearchMatchRepository implements SavedSearchMatchRepository {
  readonly matches: SavedSearchMatch[] = [];
  async createIfNotExists(match: SavedSearchMatch): Promise<boolean> {
    const exists = this.matches.some((m) => m.savedSearchId === match.savedSearchId && m.externalTenderId === match.externalTenderId);
    if (exists) return false;
    this.matches.push(match);
    return true;
  }
  async save(match: SavedSearchMatch): Promise<void> {
    const index = this.matches.findIndex((m) => m.id === match.id);
    if (index === -1) this.matches.push(match);
    else this.matches[index] = match;
  }
  async findBySavedSearchAndTender(input: { organizationId: string; savedSearchId: string; externalTenderId: string }): Promise<SavedSearchMatch | null> {
    return this.matches.find((m) => m.organizationId === input.organizationId && m.savedSearchId === input.savedSearchId && m.externalTenderId === input.externalTenderId) ?? null;
  }
  async findById(input: { organizationId: string; matchId: string }): Promise<SavedSearchMatch | null> {
    return this.matches.find((m) => m.id === input.matchId && m.organizationId === input.organizationId) ?? null;
  }
  /** Mirroir du claim atomique réel (`PrismaSavedSearchMatchRepository.claimPendingEmailBatch`) —
   *  marque `SENDING` avant de retourner, pour que les tests puissent observer/exercer le même
   *  contrat que la production (correctif audit P1-001). */
  async claimPendingEmailBatch(input: { organizationId?: string | undefined; limit: number; now: Date; staleClaimThresholdMs: number }): Promise<SavedSearchMatch[]> {
    const staleBefore = input.now.getTime() - input.staleClaimThresholdMs;
    const eligible = this.matches
      .filter((m) => (!input.organizationId || m.organizationId === input.organizationId))
      .filter((m) => m.emailStatus === "PENDING" || (m.emailStatus === "SENDING" && m.updatedAt.getTime() < staleBefore))
      .slice(0, input.limit);
    for (const match of eligible) match.claimForSending(input.now);
    return eligible;
  }
  async listBySavedSearch(input: { organizationId: string; savedSearchId: string; limit: number; cursor?: string | undefined }): Promise<{ items: SavedSearchMatch[]; nextCursor: string | null }> {
    const items = this.matches.filter((m) => m.organizationId === input.organizationId && m.savedSearchId === input.savedSearchId).slice(0, input.limit);
    return { items, nextCursor: null };
  }
}
