import { describe, expect, it } from "vitest";
import { EmailAlertStatus, SavedSearchMatchStatus } from "./enums";
import { SavedSearchMatch } from "./saved-search-match.entity";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function buildMatch() {
  return SavedSearchMatch.create({ id: "match-1", organizationId: "org-1", savedSearchId: "ss-1", externalTenderId: "et-1", score: 80, matchReasons: [], occurredAt: NOW });
}

describe("SavedSearchMatch — mission §49/§51/§52/§67/§136", () => {
  it("starts NEW with emailStatus PENDING", () => {
    const match = buildMatch();
    expect(match.status).toBe(SavedSearchMatchStatus.New);
    expect(match.emailStatus).toBe(EmailAlertStatus.Pending);
  });

  it("mission §51/§52 — setStatus persists Interested/Ignored", () => {
    const match = buildMatch();
    match.setStatus(SavedSearchMatchStatus.Ignored, NOW);
    expect(match.status).toBe(SavedSearchMatchStatus.Ignored);
  });

  it("markEmailSent transitions to SENT and clears the error", () => {
    const match = buildMatch();
    match.recordEmailFailure({ error: "boom", occurredAt: NOW });
    match.markEmailSent(NOW);
    expect(match.emailStatus).toBe(EmailAlertStatus.Sent);
    expect(match.emailLastError).toBeUndefined();
  });

  it("BLOQUANT — mission §67/§136: recordEmailFailure stays PENDING (retried) below max attempts", () => {
    const match = buildMatch();
    match.recordEmailFailure({ error: "smtp down", occurredAt: NOW });
    expect(match.emailStatus).toBe(EmailAlertStatus.Pending);
    expect(match.emailAttemptCount).toBe(1);
  });

  it("BLOQUANT — mission §67/§136: recordEmailFailure gives up (FAILED) after EMAIL_ALERT_MAX_ATTEMPTS, never an infinite retry", () => {
    const match = buildMatch();
    for (let i = 0; i < 8; i += 1) {
      match.recordEmailFailure({ error: "smtp down", occurredAt: NOW });
    }
    expect(match.emailStatus).toBe(EmailAlertStatus.Failed);
    expect(match.emailAttemptCount).toBe(8);
  });

  it("mission §50 — refreshFromRematch updates score/reasons without resetting status (no re-notification)", () => {
    const match = buildMatch();
    match.setStatus(SavedSearchMatchStatus.Ignored, NOW);
    match.refreshFromRematch({ score: 95, matchReasons: [], occurredAt: NOW });
    expect(match.score).toBe(95);
    expect(match.status).toBe(SavedSearchMatchStatus.Ignored);
  });
});
