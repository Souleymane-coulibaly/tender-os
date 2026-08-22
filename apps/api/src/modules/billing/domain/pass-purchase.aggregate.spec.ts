import { describe, expect, it } from "vitest";
import { PassPurchaseAlreadyConsumedError, PassPurchaseAlreadyReservedError } from "./errors";
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

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.2 — reserveForTender (mission '1 Pass AO = 1 Tender / 1 AO')", () => {
    it("reserves an available pass, is idempotent for the same tender, and refuses a different one", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Reserved);
      expect(pass.reservedTenderId).toBe("tender-a");

      expect(() => pass.reserveForTender("tender-a", OCCURRED_AT)).not.toThrow();
      expect(() => pass.reserveForTender("tender-b", OCCURRED_AT)).toThrow(PassPurchaseAlreadyReservedError);
    });

    it("a pass already CONSUMED for tender A can never be reserved for tender B (even though reservation precedes consumption in the normal flow)", () => {
      const pass = createPass();
      pass.consumeForTender("tender-a", OCCURRED_AT);
      expect(() => pass.reserveForTender("tender-b", OCCURRED_AT)).toThrow(PassPurchaseAlreadyConsumedError);
    });

    it("consumeForTender transitions RESERVED -> CONSUMED for the SAME tender (nominal E1.2 flow)", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      pass.consumeForTender("tender-a", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Consumed);
      expect(pass.consumedTenderId).toBe("tender-a");
    });

    it("consumeForTender refuses to consume a pass RESERVED for a DIFFERENT tender — never an arbitrary reassignment", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      expect(() => pass.consumeForTender("tender-b", OCCURRED_AT)).toThrow(PassPurchaseAlreadyReservedError);
    });
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.3 — releaseReservation (mission §5/§8, RESERVED(A) -> AVAILABLE)", () => {
    it("releases a RESERVED pass back to AVAILABLE for the SAME tender", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      pass.releaseReservation("tender-a", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Available);
      expect(pass.reservedTenderId).toBeUndefined();
    });

    it("is a silent no-op on an AVAILABLE pass (never reserved) — never an exception", () => {
      const pass = createPass();
      expect(() => pass.releaseReservation("tender-a", OCCURRED_AT)).not.toThrow();
      expect(pass.status).toBe(PassPurchaseStatus.Available);
    });

    it("is a silent no-op when releasing for a DIFFERENT tenderId than the one actually reserved — never releases someone else's reservation", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      pass.releaseReservation("tender-b", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Reserved);
      expect(pass.reservedTenderId).toBe("tender-a");
    });

    it("mission §8 state machine — CONSUMED(A) -> AVAILABLE is structurally impossible (silent no-op, never a regression of a paid consumption)", () => {
      const pass = createPass();
      pass.consumeForTender("tender-a", OCCURRED_AT);
      pass.releaseReservation("tender-a", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Consumed);
      expect(pass.consumedTenderId).toBe("tender-a");
    });

    it("mission §8 — once released, the pass can be re-reserved for a DIFFERENT tender (RESERVED(A) -> AVAILABLE -> RESERVED(B) is the only legal re-entry)", () => {
      const pass = createPass();
      pass.reserveForTender("tender-a", OCCURRED_AT);
      pass.releaseReservation("tender-a", OCCURRED_AT);
      pass.reserveForTender("tender-b", OCCURRED_AT);
      expect(pass.status).toBe(PassPurchaseStatus.Reserved);
      expect(pass.reservedTenderId).toBe("tender-b");
    });
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
