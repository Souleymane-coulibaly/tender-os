import { describe, expect, it } from "vitest";
import { InvalidLotAmountRangeError, InvalidLotEstimatedAmountError, TenderLotDeletedError, TenderLotNotDeletedError } from "./errors";
import { TenderLot } from "./tender-lot.entity";

function createLot(displayOrder = 0, overrides: Partial<Parameters<typeof TenderLot.create>[0]> = {}): TenderLot {
  return TenderLot.create({
    id: "lot-1",
    organizationId: "org-1",
    tenderId: "tender-1",
    lotNumber: "01",
    title: "Lot travaux",
    displayOrder,
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("TenderLot#create", () => {
  it("creates an active lot at the given position", () => {
    const lot = createLot(2);

    expect(lot.deletedAt).toBeUndefined();
    expect(lot.displayOrder).toBe(2);
    expect(lot.lotNumber).toBe("01");
  });
});

describe("TenderLot#update", () => {
  it("updates only the provided fields and bumps updatedAt", () => {
    const lot = createLot();

    lot.update({ title: "Lot travaux revise" }, new Date("2026-02-01T00:00:00Z"));

    expect(lot.title).toBe("Lot travaux revise");
    expect(lot.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("never exposes a way to change lotNumber, tenderId or organizationId", () => {
    const lot = createLot();

    lot.update({ title: "Autre titre" }, new Date());

    expect(lot.lotNumber).toBe("01");
    expect(lot.tenderId).toBe("tender-1");
    expect(lot.organizationId).toBe("org-1");
  });

  it("throws TenderLotDeletedError when updating an already-deleted lot", () => {
    const lot = createLot();
    lot.softDelete(new Date());

    expect(() => lot.update({ title: "x" }, new Date())).toThrow(TenderLotDeletedError);
  });
});

describe("TenderLot#reorder", () => {
  it("changes displayOrder and bumps updatedAt", () => {
    const lot = createLot(0);

    lot.reorder(3, new Date("2026-02-01T00:00:00Z"));

    expect(lot.displayOrder).toBe(3);
    expect(lot.updatedAt).toEqual(new Date("2026-02-01T00:00:00Z"));
  });

  it("throws TenderLotDeletedError when reordering an already-deleted lot", () => {
    const lot = createLot();
    lot.softDelete(new Date());

    expect(() => lot.reorder(1, new Date())).toThrow(TenderLotDeletedError);
  });
});

describe("TenderLot#softDelete", () => {
  it("records deletedAt and bumps updatedAt", () => {
    const lot = createLot();

    lot.softDelete(new Date("2026-03-01T00:00:00Z"));

    expect(lot.deletedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
    expect(lot.updatedAt).toEqual(new Date("2026-03-01T00:00:00Z"));
  });

  it("throws TenderLotDeletedError when deleting an already-deleted lot", () => {
    const lot = createLot();
    lot.softDelete(new Date());

    expect(() => lot.softDelete(new Date())).toThrow(TenderLotDeletedError);
  });
});

describe("TenderLot#restore", () => {
  it("clears deletedAt and repositions the lot", () => {
    const lot = createLot(0);
    lot.softDelete(new Date("2026-03-01T00:00:00Z"));

    lot.restore(5, new Date("2026-04-01T00:00:00Z"));

    expect(lot.deletedAt).toBeUndefined();
    expect(lot.displayOrder).toBe(5);
    expect(lot.updatedAt).toEqual(new Date("2026-04-01T00:00:00Z"));
  });

  it("throws TenderLotNotDeletedError when the lot is not deleted", () => {
    const lot = createLot();

    expect(() => lot.restore(0, new Date())).toThrow(TenderLotNotDeletedError);
  });
});

describe("TenderLot amounts — correction audit Codex P1 (2e passe)", () => {
  it("refuses a non-numeric minimumAmount/maximumAmount at creation", () => {
    expect(() => createLot(0, { minimumAmount: "not-a-number" })).toThrow(InvalidLotEstimatedAmountError);
    expect(() => createLot(0, { maximumAmount: "not-a-number" })).toThrow(InvalidLotEstimatedAmountError);
  });

  it("refuses minimumAmount > maximumAmount at creation", () => {
    expect(() => createLot(0, { minimumAmount: "600000", maximumAmount: "400000" })).toThrow(InvalidLotAmountRangeError);
  });

  it("accepts minimumAmount <= maximumAmount at creation", () => {
    const lot = createLot(0, { minimumAmount: "400000", maximumAmount: "600000" });
    expect(lot.minimumAmount).toBe("400000");
    expect(lot.maximumAmount).toBe("600000");
  });

  it("refuses update when the resulting range is inconsistent, even if only one bound is touched", () => {
    const lot = createLot(0, { minimumAmount: "400000", maximumAmount: "600000" });

    expect(() => lot.update({ minimumAmount: "700000" }, new Date())).toThrow(InvalidLotAmountRangeError);
  });
});
