import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetCurrentUserUseCase } from "../../../identity";
import { ExternalTender } from "../../domain/external-tender.entity";
import { EmailFrequency } from "../../domain/enums";
import { SavedSearch } from "../../domain/saved-search.entity";
import { SavedSearchMatch } from "../../domain/saved-search-match.entity";
import { FakeEmailProvider, FixedClock, InMemoryExternalTenderRepository, InMemorySavedSearchMatchRepository, InMemorySavedSearchRepository } from "../../test-support/fakes";
import { SendPendingEmailAlertsUseCase } from "./send-pending-email-alerts.use-case";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const ORG_ID = "org-1";

function fakeGetCurrentUserUseCase(email = "user1@example.com"): GetCurrentUserUseCase {
  return { execute: vi.fn(async () => ({ id: "user-1", email, displayName: "User One", status: "ACTIVE", createdAt: NOW.toISOString() })) } as unknown as GetCurrentUserUseCase;
}

function buildTender(id: string) {
  return ExternalTender.create({ id, organizationId: ORG_ID, source: "BOAMP", marketType: "PUBLIC", externalId: `ext-${id}`, title: `Marché ${id}`, cpvCodes: [], occurredAt: NOW });
}

describe("SendPendingEmailAlertsUseCase — mission §43/§66/§67/§111/§136/§137/§138", () => {
  let matchRepository: InMemorySavedSearchMatchRepository;
  let savedSearchRepository: InMemorySavedSearchRepository;
  let externalTenderRepository: InMemoryExternalTenderRepository;
  let emailProvider: FakeEmailProvider;

  beforeEach(() => {
    matchRepository = new InMemorySavedSearchMatchRepository();
    savedSearchRepository = new InMemorySavedSearchRepository();
    externalTenderRepository = new InMemoryExternalTenderRepository();
    emailProvider = new FakeEmailProvider();
  });

  function buildUseCase(getCurrentUserUseCase: GetCurrentUserUseCase = fakeGetCurrentUserUseCase()) {
    return new SendPendingEmailAlertsUseCase(matchRepository, savedSearchRepository, externalTenderRepository, emailProvider, new FixedClock(NOW), getCurrentUserUseCase);
  }

  it("BLOQUANT — mission §138: IMMEDIATE frequency sends a single email right away for one match", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: true, emailFrequency: EmailFrequency.Immediate, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    const tender = buildTender("et-1");
    externalTenderRepository.tenders.push(tender);
    const match = SavedSearchMatch.create({ id: "m-1", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW });
    matchRepository.matches.push(match);

    const result = await buildUseCase().execute({ batchSize: 100, baseUrl: "https://app.tenderos.example" });

    expect(result.sent).toBe(1);
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]!.to).toBe("user1@example.com");
    expect(match.emailStatus).toBe("SENT");
  });

  it("BLOQUANT — mission §137: DAILY_DIGEST batches several matches into ONE email", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: true, emailFrequency: EmailFrequency.DailyDigest, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    for (const id of ["et-1", "et-2", "et-3"]) {
      externalTenderRepository.tenders.push(buildTender(id));
      matchRepository.matches.push(SavedSearchMatch.create({ id: `m-${id}`, organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: id, score: 80, matchReasons: [], occurredAt: NOW }));
    }

    const result = await buildUseCase().execute({ batchSize: 100, baseUrl: "https://app.tenderos.example" });

    expect(emailProvider.sent).toHaveLength(1);
    expect(result.sent).toBe(3);
    expect(result.digestsSent).toBe(1);
  });

  it("mission §111 idempotence — a digest already sent today is not re-sent on the next tick", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: true, emailFrequency: EmailFrequency.DailyDigest, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    externalTenderRepository.tenders.push(buildTender("et-1"));
    matchRepository.matches.push(SavedSearchMatch.create({ id: "m-1", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW }));

    await buildUseCase().execute({ batchSize: 100, baseUrl: "https://x" });
    expect(emailProvider.sent).toHaveLength(1);

    // Nouveau match le même jour — le digest ne doit PAS repartir avant 24h.
    externalTenderRepository.tenders.push(buildTender("et-2"));
    matchRepository.matches.push(SavedSearchMatch.create({ id: "m-2", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-2", score: 80, matchReasons: [], occurredAt: NOW }));

    const second = await buildUseCase().execute({ batchSize: 100, baseUrl: "https://x" });
    expect(second.digestsSent).toBe(0);
    expect(emailProvider.sent).toHaveLength(1);
  });

  it("mission §127 — alertEmail=false leaves matches PENDING forever, never sent, never a failure", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: false, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    externalTenderRepository.tenders.push(buildTender("et-1"));
    const match = SavedSearchMatch.create({ id: "m-1", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW });
    matchRepository.matches.push(match);

    const result = await buildUseCase().execute({ batchSize: 100, baseUrl: "https://x" });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(match.emailStatus).toBe("PENDING");
  });

  it("BLOQUANT — mission §75: the recipient is always resolved from the owner's account, never a frontend-supplied address", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: true, emailFrequency: EmailFrequency.Immediate, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    externalTenderRepository.tenders.push(buildTender("et-1"));
    matchRepository.matches.push(SavedSearchMatch.create({ id: "m-1", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW }));

    const getCurrentUserUseCase = fakeGetCurrentUserUseCase("owner-real-address@example.com");
    await buildUseCase(getCurrentUserUseCase).execute({ batchSize: 100, baseUrl: "https://x" });

    expect(getCurrentUserUseCase.execute).toHaveBeenCalledWith({ userId: "user-1" });
    expect(emailProvider.sent[0]!.to).toBe("owner-real-address@example.com");
  });

  it("mission §136 — a provider failure is recorded (matching engine/in-app path unaffected), never crashes the tick", async () => {
    const search = SavedSearch.create({ id: "ss-1", organizationId: ORG_ID, ownerUserId: "user-1", name: "Nettoyage", alertEmail: true, emailFrequency: EmailFrequency.Immediate, createdBy: "user-1", occurredAt: NOW });
    savedSearchRepository.searches.push(search);
    externalTenderRepository.tenders.push(buildTender("et-1"));
    const match = SavedSearchMatch.create({ id: "m-1", organizationId: ORG_ID, savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW });
    matchRepository.matches.push(match);

    emailProvider.shouldFail = true;
    const result = await buildUseCase().execute({ batchSize: 100, baseUrl: "https://x" });

    expect(result.failed).toBe(1);
    expect(match.emailStatus).toBe("PENDING");
    expect(match.emailAttemptCount).toBe(1);
  });
});
