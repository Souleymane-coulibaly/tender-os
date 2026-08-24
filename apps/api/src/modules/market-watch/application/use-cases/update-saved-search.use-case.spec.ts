import { beforeEach, describe, expect, it } from "vitest";
import { SavedSearchNotFoundError } from "../../domain/errors";
import { SavedSearch } from "../../domain/saved-search.entity";
import { FixedClock, InMemorySavedSearchRepository } from "../../test-support/fakes";
import { UpdateSavedSearchUseCase } from "./update-saved-search.use-case";
import type { SyncMarketSourceUseCase } from "./sync-market-source.use-case";

const ORG_A = "org-a";
const OWNER = "user-owner";
const OTHER_USER = "user-other";
const NOW = new Date("2026-01-15T10:00:00.000Z");

class RecordingAuditLogWriter {
  readonly entries: unknown[] = [];
  async record(entry: unknown): Promise<void> {
    this.entries.push(entry);
  }
}

class StubSyncMarketSourceUseCase {
  calls: { savedSearchId: string }[] = [];
  shouldThrow = false;
  async backfillMatchesForSavedSearch(input: { savedSearch: { id: string } }): Promise<{ matchesCreated: number; notificationsCreated: number }> {
    this.calls.push({ savedSearchId: input.savedSearch.id });
    if (this.shouldThrow) throw new Error("boom");
    return { matchesCreated: 2, notificationsCreated: 2 };
  }
}

describe("UpdateSavedSearchUseCase", () => {
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

  function buildUseCase(withSync = true): UpdateSavedSearchUseCase {
    return new UpdateSavedSearchUseCase(
      repository,
      auditLog,
      new FixedClock(NOW),
      { execute: async () => ({ organizationId: "", clientAccountId: undefined, name: "" }) } as never,
      { execute: async () => {} } as never,
      withSync ? (syncMarketSourceUseCase as unknown as SyncMarketSourceUseCase) : undefined,
    );
  }

  it("BLOQUANT (correctif P1 E10) — updating criteria on an active saved search backfills matches against the existing backlog, not just future cycles", async () => {
    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, criteria: { includeKeywords: ["nettoyage industriel"] } });

    expect(syncMarketSourceUseCase.calls).toHaveLength(1);
    expect(syncMarketSourceUseCase.calls[0]?.savedSearchId).toBe(savedSearchId);
  });

  it("never backfills a DISABLED saved search (mission §75)", async () => {
    const savedSearch = await repository.findById({ organizationId: ORG_A, savedSearchId });
    savedSearch!.setActive(false, NOW);
    await repository.save(savedSearch!);

    const useCase = buildUseCase();
    await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, name: "Renamed" });

    expect(syncMarketSourceUseCase.calls).toHaveLength(0);
  });

  it("a backfill failure never fails the update itself (best-effort)", async () => {
    syncMarketSourceUseCase.shouldThrow = true;
    const useCase = buildUseCase();

    const result = await useCase.execute({ organizationId: ORG_A, actorId: OWNER, actorRole: "OWNER", savedSearchId, name: "Renamed despite backfill failure" });

    expect(result.name).toBe("Renamed despite backfill failure");
  });

  it("never lets a non-owner update someone else's saved search (mission §17)", async () => {
    const useCase = buildUseCase();
    await expect(useCase.execute({ organizationId: ORG_A, actorId: OTHER_USER, actorRole: "OWNER", savedSearchId, name: "Hijacked" })).rejects.toThrow(SavedSearchNotFoundError);
    expect(syncMarketSourceUseCase.calls).toHaveLength(0);
  });
});
