import { describe, expect, it } from "vitest";
import { PricingScheduleLine } from "./pricing-schedule-line.entity";
import { NonPriceableLineError } from "./errors";
import { PricingScheduleLineKind, PricingScheduleLineStatus } from "./enums";

function createLine(overrides?: Partial<Parameters<typeof PricingScheduleLine.create>[0]>) {
  return PricingScheduleLine.create({
    id: "line-1",
    organizationId: "org-1",
    pricingScheduleVersionId: "version-1",
    sheetName: "BPU Lot1",
    rowNumber: 3,
    kind: PricingScheduleLineKind.PriceItem,
    designation: "Nettoyage des bureaux",
    unit: "m2",
    quantity: "120",
    designationCellRef: "A3",
    quantityCellRef: "C3",
    buyerUnitPriceCellRef: "D3",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("PricingScheduleLine", () => {
  it("starts EMPTY with no proposed price", () => {
    const line = createLine();
    expect(line.status).toBe(PricingScheduleLineStatus.Empty);
    expect(line.proposedUnitPrice).toBeUndefined();
    expect(line.proposedTotal).toBeUndefined();
    expect(line.currencyCode).toBe("EUR");
  });

  it("BLOQUANT — buyer-locked fields (designation/unit/quantity/cell refs) expose no public setter at all", () => {
    const line = createLine();
    const publicMethodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(line)).filter((name) => name !== "constructor");
    for (const lockedField of ["setDesignation", "setUnit", "setQuantity", "setDesignationCellRef", "setQuantityCellRef"]) {
      expect(publicMethodNames).not.toContain(lockedField);
    }
  });

  it("setUnitPrice computes total = quantity × unitPrice via Decimal, never a float rounding error", () => {
    const line = createLine({ quantity: "3" });
    line.setUnitPrice({ unitPrice: "1.2345", occurredAt: new Date("2026-01-02T00:00:00Z") });
    expect(line.proposedUnitPrice).toBe("1.234500");
    expect(line.proposedTotal).toBe("3.703500");
    expect(line.status).toBe(PricingScheduleLineStatus.Priced);
  });

  it("setUnitPrice without a buyer quantity leaves proposedTotal unset and flags NEEDS_REVIEW rather than inventing a total", () => {
    const line = createLine({ quantity: undefined });
    line.setUnitPrice({ unitPrice: "10", occurredAt: new Date() });
    expect(line.proposedUnitPrice).toBe("10.000000");
    expect(line.proposedTotal).toBeUndefined();
    expect(line.status).toBe(PricingScheduleLineStatus.NeedsReview);
  });

  it("BLOQUANT — a non-PRICE_ITEM line (title/subtotal/note) refuses setUnitPrice and setCostBreakdown", () => {
    for (const kind of [PricingScheduleLineKind.SectionHeader, PricingScheduleLineKind.Subtotal, PricingScheduleLineKind.Note]) {
      const line = createLine({ kind, quantity: undefined, designationCellRef: undefined, quantityCellRef: undefined, buyerUnitPriceCellRef: undefined });
      expect(() => line.setUnitPrice({ unitPrice: "10", occurredAt: new Date() })).toThrow(NonPriceableLineError);
      expect(() => line.setCostBreakdown({ costBreakdown: { laborCost: "5" }, occurredAt: new Date() })).toThrow(NonPriceableLineError);
    }
  });

  it("setCostBreakdown stores the breakdown but never touches proposedUnitPrice/proposedTotal itself", () => {
    const line = createLine();
    line.setCostBreakdown({ costBreakdown: { laborCost: "50", materialCost: "20", marginRate: "0.1" }, occurredAt: new Date() });
    expect(line.costBreakdown).toEqual({ laborCost: "50", materialCost: "20", marginRate: "0.1" });
    expect(line.proposedUnitPrice).toBeUndefined();
    expect(line.status).toBe(PricingScheduleLineStatus.Empty);
  });

  it("setCandidateComment works regardless of line kind", () => {
    const line = createLine({ kind: PricingScheduleLineKind.Note, quantity: undefined, designationCellRef: undefined, quantityCellRef: undefined, buyerUnitPriceCellRef: undefined });
    line.setCandidateComment({ candidateComment: "À vérifier avec le sous-traitant", occurredAt: new Date() });
    expect(line.candidateComment).toBe("À vérifier avec le sous-traitant");
  });

  it("flagNeedsReview forces NEEDS_REVIEW regardless of prior status", () => {
    const line = createLine();
    line.setUnitPrice({ unitPrice: "5", occurredAt: new Date() });
    expect(line.status).toBe(PricingScheduleLineStatus.Priced);
    line.flagNeedsReview(new Date());
    expect(line.status).toBe(PricingScheduleLineStatus.NeedsReview);
  });
});
