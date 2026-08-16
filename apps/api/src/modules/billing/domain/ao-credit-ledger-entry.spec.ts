import { describe, expect, it } from "vitest";
import { AoCreditMovementType } from "./ao-credit-movement-type";
import { createAoCreditLedgerEntry } from "./ao-credit-ledger-entry";
import { InvalidAoCreditLedgerEntryError } from "./errors";

const OCCURRED_AT = new Date("2026-08-15T09:00:00Z");

function baseInput(overrides: Partial<Parameters<typeof createAoCreditLedgerEntry>[0]> = {}) {
  return {
    id: "entry-1",
    organizationId: "org-1",
    type: AoCreditMovementType.TrialGrant,
    amount: 1,
    balanceAfter: 1,
    occurredAt: OCCURRED_AT,
    ...overrides,
  };
}

describe("createAoCreditLedgerEntry — TRIAL_GRANT (V2 Sprint 25)", () => {
  it("mission §16 — accepts exactly amount 1, with no period", () => {
    const entry = createAoCreditLedgerEntry(baseInput());

    expect(entry.type).toBe(AoCreditMovementType.TrialGrant);
    expect(entry.amount).toBe(1);
    expect(entry.period).toBeUndefined();
  });

  it("rejects any amount other than 1 — never a variable Trial credit amount", () => {
    expect(() => createAoCreditLedgerEntry(baseInput({ amount: 2 }))).toThrow(InvalidAoCreditLedgerEntryError);
    expect(() => createAoCreditLedgerEntry(baseInput({ amount: 0 }))).toThrow(InvalidAoCreditLedgerEntryError);
    expect(() => createAoCreditLedgerEntry(baseInput({ amount: -1 }))).toThrow(InvalidAoCreditLedgerEntryError);
  });

  it("rejects a period — idempotence is 'at most once per organization', never 'per month' like GRANT", () => {
    expect(() => createAoCreditLedgerEntry(baseInput({ period: "2026-08" }))).toThrow(InvalidAoCreditLedgerEntryError);
  });
});
