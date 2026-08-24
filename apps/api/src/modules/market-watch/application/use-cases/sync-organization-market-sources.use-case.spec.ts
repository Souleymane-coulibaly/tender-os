import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import type { Clock } from "../../../../shared-kernel/clock";
import type { MarketSourceConnector } from "../ports/market-source-connector";
import type { MarketSourceSyncRunRepository } from "../ports/market-source-sync-run.repository";
import type { SyncMarketSourceUseCase } from "./sync-market-source.use-case";
import { InMemoryMarketSourceSyncLeaseRepository } from "../../test-support/fakes";
import { SyncOrganizationMarketSourcesUseCase } from "./sync-organization-market-sources.use-case";

const ORG_ID = "org-1";
const NOW = new Date("2026-08-24T08:00:00.000Z");

class RecordingSyncRunRepository implements MarketSourceSyncRunRepository {
  readonly started: string[] = [];
  readonly completed: { source?: string; status: string }[] = [];
  async start(input: { id: string; organizationId: string; source: string; startedAt: Date }): Promise<void> {
    this.started.push(input.source);
  }
  async complete(input: { id: string; finishedAt: Date; status: "SUCCEEDED" | "FAILED" }): Promise<void> {
    this.completed.push({ status: input.status });
  }
}

function fakeConnector(source: string): MarketSourceConnector {
  return { source, marketType: "PUBLIC", search: vi.fn(async () => ({ items: [], nextCursor: null })) };
}

describe("SyncOrganizationMarketSourcesUseCase — lease release (diagnostic runtime E10)", () => {
  let leaseRepository: InMemoryMarketSourceSyncLeaseRepository;
  let syncRunRepository: RecordingSyncRunRepository;
  let counter: number;

  beforeEach(() => {
    leaseRepository = new InMemoryMarketSourceSyncLeaseRepository();
    syncRunRepository = new RecordingSyncRunRepository();
    counter = 0;
  });

  function buildUseCase(syncResult: "success" | "failure"): SyncOrganizationMarketSourcesUseCase {
    const syncMarketSourceUseCase = {
      execute: vi.fn(async () => {
        if (syncResult === "failure") throw new Error("source down");
        return { collected: 1, created: 1, updated: 0, unchanged: 0, matchesCreated: 1, notificationsCreated: 1 };
      }),
    } as unknown as SyncMarketSourceUseCase;
    const idGenerator: IdGenerator = { generate: () => `id-${(counter += 1)}` };
    const clock: Clock = { now: () => NOW };
    return new SyncOrganizationMarketSourcesUseCase([fakeConnector("BOAMP")], leaseRepository, syncRunRepository, idGenerator, clock, syncMarketSourceUseCase);
  }

  it("BLOQUANT — releases the lease immediately after a SUCCESSFUL sync: a second run 1s later claims again, never waiting out the TTL", async () => {
    await buildUseCase("success").execute({ organizationId: ORG_ID });

    expect(leaseRepository.releaseCalls).toEqual([{ organizationId: ORG_ID, source: "BOAMP" }]);
    // Un second run immédiat reprend le bail (avant le correctif : refusé pendant 10 minutes).
    const reclaimed = await leaseRepository.tryClaim({ organizationId: ORG_ID, source: "BOAMP", now: new Date(Date.now() + 1_000), leaseDurationMs: 600_000 });
    expect(reclaimed).toBe(true);
  });

  it("BLOQUANT — releases the lease even when the sync FAILS (finally, never only the happy path)", async () => {
    await buildUseCase("failure").execute({ organizationId: ORG_ID });

    expect(leaseRepository.releaseCalls).toEqual([{ organizationId: ORG_ID, source: "BOAMP" }]);
    expect(syncRunRepository.completed).toEqual([{ status: "FAILED" }]);
  });

  it("skips (never releases someone else's lease) when the claim itself is refused", async () => {
    // Un autre détenteur a déjà le bail, non expiré DU POINT DE VUE de l'horloge injectée (`NOW`) —
    // jamais `new Date()` réel ici, qui serait antérieur à `NOW` et rendrait le bail déjà expiré.
    await leaseRepository.tryClaim({ organizationId: ORG_ID, source: "BOAMP", now: NOW, leaseDurationMs: 600_000 });

    const result = await buildUseCase("success").execute({ organizationId: ORG_ID });

    expect(result.collected).toBe(0);
    expect(leaseRepository.releaseCalls).toHaveLength(0);
    expect(syncRunRepository.started).toHaveLength(0);
  });
});
