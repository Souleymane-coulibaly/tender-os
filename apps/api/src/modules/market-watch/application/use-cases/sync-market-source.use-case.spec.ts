import { beforeEach, describe, expect, it } from "vitest";
import { ExternalTender } from "../../domain/external-tender.entity";
import { SavedSearch } from "../../domain/saved-search.entity";
import {
  FakeMarketSourceConnector,
  FixedClock,
  InMemoryExternalTenderRepository,
  InMemoryOutboxWriter,
  InMemorySavedSearchMatchRepository,
  InMemorySavedSearchRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import type { NotificationRepository } from "../../../notifications/application/ports/notification.repository";
import { CreateNotificationUseCase } from "../../../notifications/application/use-cases/create-notification.use-case";
import { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

class InMemoryAtomicTransactionRunner {
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

class InMemoryNotificationRepository implements NotificationRepository {
  readonly notifications: { organizationId: string; userId: string; type: string }[] = [];
  async create(notification: { organizationId: string; userId: string; type: string }): Promise<void> {
    this.notifications.push({ organizationId: notification.organizationId, userId: notification.userId, type: notification.type });
  }
  async save(): Promise<void> {}
  async findById(): Promise<null> {
    return null;
  }
  async listByUser(): Promise<{ items: never[]; nextCursor: null }> {
    return { items: [], nextCursor: null };
  }
  async countUnreadByUser(): Promise<number> {
    return 0;
  }
  async markAllReadByUser(): Promise<void> {}
}

const NOW = new Date("2026-06-01T00:00:00.000Z");
const ORG_ID = "org-1";

describe("SyncMarketSourceUseCase — mission §5-§12/§26/§48/§65", () => {
  let externalTenderRepository: InMemoryExternalTenderRepository;
  let savedSearchRepository: InMemorySavedSearchRepository;
  let matchRepository: InMemorySavedSearchMatchRepository;
  let outboxWriter: InMemoryOutboxWriter;
  let notificationRepository: InMemoryNotificationRepository;
  let connector: FakeMarketSourceConnector;
  let useCase: SyncMarketSourceUseCase;

  beforeEach(() => {
    externalTenderRepository = new InMemoryExternalTenderRepository();
    savedSearchRepository = new InMemorySavedSearchRepository();
    matchRepository = new InMemorySavedSearchMatchRepository();
    outboxWriter = new InMemoryOutboxWriter();
    notificationRepository = new InMemoryNotificationRepository();
    connector = new FakeMarketSourceConnector("BOAMP", "PUBLIC");

    const createNotificationUseCase = new CreateNotificationUseCase(notificationRepository, new SequentialIdGenerator(), new FixedClock(NOW));

    useCase = new SyncMarketSourceUseCase(
      externalTenderRepository,
      savedSearchRepository,
      matchRepository,
      new InMemoryAtomicTransactionRunner(),
      new SequentialIdGenerator(),
      new FixedClock(NOW),
      outboxWriter,
      createNotificationUseCase,
    );
  });

  it("BLOQUANT — mission §124: the same externalId fetched twice never creates two ExternalTenders (dedup by source+externalId)", async () => {
    connector.setItems([{ externalId: "boamp-1", title: "Marché A", cpvCodes: [] }]);
    await useCase.execute({ organizationId: ORG_ID, connector });
    await useCase.execute({ organizationId: ORG_ID, connector });

    expect(externalTenderRepository.tenders).toHaveLength(1);
  });

  it("BLOQUANT — mission §125: a changed deadline updates the same ExternalTender (never a duplicate)", async () => {
    connector.setItems([{ externalId: "boamp-1", title: "Marché A", cpvCodes: [], submissionDeadline: new Date("2026-07-01T00:00:00.000Z") }]);
    const first = await useCase.execute({ organizationId: ORG_ID, connector });
    expect(first.created).toBe(1);

    connector.setItems([{ externalId: "boamp-1", title: "Marché A", cpvCodes: [], submissionDeadline: new Date("2026-08-01T00:00:00.000Z") }]);
    const second = await useCase.execute({ organizationId: ORG_ID, connector });

    expect(second.updated).toBe(1);
    expect(externalTenderRepository.tenders).toHaveLength(1);
    expect(externalTenderRepository.tenders[0]!.submissionDeadline).toEqual(new Date("2026-08-01T00:00:00.000Z"));
  });

  it("an unchanged re-fetch is counted as unchanged, never as an update (mission §12)", async () => {
    connector.setItems([{ externalId: "boamp-1", title: "Marché A", cpvCodes: [] }]);
    await useCase.execute({ organizationId: ORG_ID, connector });
    const second = await useCase.execute({ organizationId: ORG_ID, connector });
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(1);
  });

  it("BLOQUANT — a new matching tender creates a match + in-app notification for the owner (mission §36/§37)", async () => {
    const savedSearch = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", criteria: { includeKeywords: ["nettoyage"] }, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(savedSearch);

    connector.setItems([{ externalId: "boamp-1", title: "Marché de nettoyage industriel", cpvCodes: [] }]);
    const result = await useCase.execute({ organizationId: ORG_ID, connector });

    expect(result.matchesCreated).toBe(1);
    expect(result.notificationsCreated).toBe(1);
    expect(matchRepository.matches).toHaveLength(1);
    expect(notificationRepository.notifications).toEqual([{ organizationId: ORG_ID, userId: "user-1", type: "SAVED_SEARCH_MATCH" }]);
  });

  it("mission §52 — a non-matching tender never creates a match", async () => {
    const savedSearch = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Cybersécurité", criteria: { includeKeywords: ["cybersécurité"] }, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(savedSearch);

    connector.setItems([{ externalId: "boamp-1", title: "Marché de nettoyage", cpvCodes: [] }]);
    const result = await useCase.execute({ organizationId: ORG_ID, connector });

    expect(result.matchesCreated).toBe(0);
    expect(matchRepository.matches).toHaveLength(0);
  });

  it("mission §65 — writes external_tender.created and saved_search.match_found Outbox events", async () => {
    const savedSearch = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", criteria: { includeKeywords: ["nettoyage"] }, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(savedSearch);
    connector.setItems([{ externalId: "boamp-1", title: "Marché de nettoyage", cpvCodes: [] }]);

    await useCase.execute({ organizationId: ORG_ID, connector });

    const eventTypes = outboxWriter.events.map((e) => e.eventType);
    expect(eventTypes).toContain("external_tender.created");
    expect(eventTypes).toContain("saved_search.match_found");
    expect(eventTypes).toContain("notification.created");
  });

  it("mission §115 — an inactive SavedSearch never matches (listActiveByOrganization excludes it)", async () => {
    const savedSearch = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", criteria: { includeKeywords: ["nettoyage"] }, createdBy: "user-1", occurredAt: NOW });
    savedSearch.setActive(false, NOW);
    savedSearchRepository.searches.push(savedSearch);

    connector.setItems([{ externalId: "boamp-1", title: "Marché de nettoyage", cpvCodes: [] }]);
    const result = await useCase.execute({ organizationId: ORG_ID, connector });

    expect(result.matchesCreated).toBe(0);
  });

  describe("backfillMatchesForSavedSearch — mission §17/§18", () => {
    it("BLOQUANT — a newly created watch matches an ExternalTender that ALREADY existed before it (never waits for the tender to change)", async () => {
      const preexisting = ExternalTender.create({
        id: "et-preexisting",
        organizationId: ORG_ID,
        source: "BOAMP",
        marketType: "PUBLIC",
        externalId: "boamp-preexisting",
        title: "Marché de nettoyage industriel",
        cpvCodes: [],
        occurredAt: new Date("2026-05-20T00:00:00.000Z"),
      });
      externalTenderRepository.tenders.push(preexisting);
      const savedSearch = SavedSearch.create({ id: "ss-new", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", criteria: { includeKeywords: ["nettoyage"] }, alertInApp: true, createdBy: "user-1", occurredAt: NOW });

      const result = await useCase.backfillMatchesForSavedSearch({ savedSearch, now: NOW });

      expect(result.matchesCreated).toBe(1);
      expect(result.notificationsCreated).toBe(1);
      expect(matchRepository.matches).toHaveLength(1);
    });

    it("running the backfill twice never creates a second match or notification (idempotent, same createIfNotExists mechanism)", async () => {
      const preexisting = ExternalTender.create({
        id: "et-preexisting",
        organizationId: ORG_ID,
        source: "BOAMP",
        marketType: "PUBLIC",
        externalId: "boamp-preexisting",
        title: "Marché de nettoyage industriel",
        cpvCodes: [],
        occurredAt: new Date("2026-05-20T00:00:00.000Z"),
      });
      externalTenderRepository.tenders.push(preexisting);
      const savedSearch = SavedSearch.create({ id: "ss-new", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", criteria: { includeKeywords: ["nettoyage"] }, alertInApp: true, createdBy: "user-1", occurredAt: NOW });

      await useCase.backfillMatchesForSavedSearch({ savedSearch, now: NOW });
      const second = await useCase.backfillMatchesForSavedSearch({ savedSearch, now: NOW });

      expect(second.matchesCreated).toBe(0);
      expect(second.notificationsCreated).toBe(0);
      expect(matchRepository.matches).toHaveLength(1);
    });

    it("a non-matching pre-existing tender is never backfilled", async () => {
      const preexisting = ExternalTender.create({ id: "et-preexisting", organizationId: ORG_ID, source: "BOAMP", marketType: "PUBLIC", externalId: "boamp-preexisting", title: "Marché de voirie", cpvCodes: [], occurredAt: new Date("2026-05-20T00:00:00.000Z") });
      externalTenderRepository.tenders.push(preexisting);
      const savedSearch = SavedSearch.create({ id: "ss-new", organizationId: ORG_ID, ownerUserId: "user-1", name: "Cybersécurité", criteria: { includeKeywords: ["cybersécurité"] }, alertInApp: true, createdBy: "user-1", occurredAt: NOW });

      const result = await useCase.backfillMatchesForSavedSearch({ savedSearch, now: NOW });

      expect(result.matchesCreated).toBe(0);
      expect(matchRepository.matches).toHaveLength(0);
    });
  });
});
