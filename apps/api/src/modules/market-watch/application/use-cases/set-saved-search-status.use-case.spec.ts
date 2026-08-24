import { beforeEach, describe, expect, it } from "vitest";
import { SavedSearch } from "../../domain/saved-search.entity";
import { FixedClock, InMemorySavedSearchRepository } from "../../test-support/fakes";
import { SetSavedSearchStatusUseCase } from "./set-saved-search-status.use-case";
import type { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

const ORG_A = "org-a";
const OWNER = "user-owner";
const NOW = new Date("2026-01-15T10:00:00.000Z");

class RecordingAuditLogWriter {
  readonly entries: unknown[] = [];
  async record(entry: unknown): Promise<void> {
    this.entries.push(entry);
  }
}

class StubSyncMarketSourceUseCase {
  calls: { savedSearchId: string }[] = [];
  async backfillMatchesForSavedSearch(input: { savedSearch: { id: string } }): Promise<{ matchesCreated: number; notificationsCreated: number }> {
    this.calls.push({ savedSearchId: input.savedSearch.id });
    return { matchesCreated: 3, notificationsCreated: 3 };
  }
}

describe("SetSavedSearchStatusUseCase", () => {
  let repository: InMemorySavedSearchRepository;
  let auditLog: RecordingAuditLogWriter;
  let syncMarketSourceUseCase: StubSyncMarketSourceUseCase;
  let savedSearchId: string;

  beforeEach(async () => {
    repository = new InMemorySavedSearchRepository();
    auditLog = new RecordingAuditLogWriter();
    syncMarketSourceUseCase = new StubSyncMarketSourceUseCase();
    const savedSearch = SavedSearch.create({ id: "ss-1", organizationId: ORG_A, ownerUserId: OWNER, name: "Nettoyage IDF", createdBy: OWNER, occurredAt: NOW });
    await repository.create(savedSearch);
    savedSearchId = savedSearch.id;
  });

  function buildUseCase(): SetSavedSearchStatusUseCase {
    return new SetSavedSearchStatusUseCase(repository, auditLog, new FixedClock(NOW), syncMarketSourceUseCase as unknown as SyncMarketSourceUseCase);
  }

  it("BLOQUANT (correctif P1 E10) — reactivating a previously disabled saved search backfills matches against the existing backlog", async () => {
    const savedSearch = await repository.findById({ organizationId: ORG_A, savedSearchId });
    savedSearch!.setActive(false, NOW);
    await repository.save(savedSearch!);

    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, enabled: true });

    expect(syncMarketSourceUseCase.calls).toHaveLength(1);
  });

  it("never backfills when disabling a saved search", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, enabled: false });

    expect(syncMarketSourceUseCase.calls).toHaveLength(0);
  });

  it("never re-backfills a saved search that was already active (no-op enable call)", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, enabled: true });

    expect(syncMarketSourceUseCase.calls).toHaveLength(0);
  });
});
