import { describe, expect, it } from "vitest";
import { PassPurchaseAlreadyConsumedError } from "./errors";
import { PassPurchase } from "./pass-purchase.aggregate";
import { PassPurchaseStatus } from "./pass-purchase-status";

const OCCURRED_AT = new Date("2026-08-13T09:00:00Z");

function createPass(overrides: Partial<Parameters<typeof PassPurchase.create>[0]> = {}) {
  return PassPurchase.create({
    id: "pass-1",
    organizationId: "org-a",
    externalReference: "cs_test_1",
    priceCents: 9900,
    currency: "EUR",
    occurredAt: OCCURRED_AT,
    ...overrides,
  });
}

describe("PassPurchase", () => {
  it("starts AVAILABLE and unattached", () => {
    const pass = createPass();
    expect(pass.status).toBe(PassPurchaseStatus.Available);
    expect(pass.consumedTenderId).toBeUndefined();
  });

  it("consumeForTender attaches it, is idempotent for the same tender, and refuses a different one", () => {
    const pass = createPass();
    pass.consumeForTender("tender-a", OCCURRED_AT);
    expect(pass.status).toBe(PassPurchaseStatus.Consumed);

    expect(() => pass.consumeForTender("tender-a", OCCURRED_AT)).not.toThrow();
    expect(() => pass.consumeForTender("tender-b", OCCURRED_AT)).toThrow(PassPurchaseAlreadyConsumedError);
  });

  describe("isUsableForTender", () => {
    it("an available, non-expired pass is usable for any tender", () => {
      const pass = createPass();
      expect(pass.isUsableForTender("tender-a", OCCURRED_AT)).toBe(true);
    });

    it("mission §9 — an expired-but-unconsumed pass can no longer be consumed for a NEW tender", () => {
      const pass = createPass({ expiresAt: new Date(OCCURRED_AT.getTime() - 1000) });
      expect(pass.isUsableForTender("tender-a", OCCURRED_AT)).toBe(false);
    });

    it("mission §9 — an EXPIRED pass already consumed for a tender remains usable for that SAME tender forever (data is never deleted on expiration)", () => {
      const pass = createPass();
      pass.consumeForTender("tender-a", OCCURRED_AT);
      const farFuture = new Date(OCCURRED_AT.getTime() + 365 * 24 * 60 * 60 * 1000);
      expect(pass.isUsableForTender("tender-a", farFuture)).toBe(true);
    });

    it("a pass consumed for tender A is never usable for tender B", () => {
      const pass = createPass();
      pass.consumeForTender("tender-a", OCCURRED_AT);
      expect(pass.isUsableForTender("tender-b", OCCURRED_AT)).toBe(false);
    });
  });
});
