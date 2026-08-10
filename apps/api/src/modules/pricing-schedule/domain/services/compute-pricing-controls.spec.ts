import { describe, expect, it } from "vitest";
import { computePricingControls } from "./compute-pricing-controls";
import { PricingScheduleLine } from "../pricing-schedule-line.entity";
import { ControlCode, ControlSeverity, PricingScheduleLineKind } from "../enums";

let counter = 0;
function nextId(): string {
  counter += 1;
  return `line-${counter}`;
}

function createLine(overrides?: Partial<Parameters<typeof PricingScheduleLine.create>[0]>) {
  return PricingScheduleLine.create({
    id: nextId(),
    organizationId: "org-1",
    pricingScheduleVersionId: "version-1",
    sheetName: "BPU Lot1",
    rowNumber: 3,
    kind: PricingScheduleLineKind.PriceItem,
    designation: "Nettoyage des bureaux",
    unit: "m2",
    quantity: "10",
    matchingKey: "nettoyage des bureaux",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  });
}

describe("computePricingControls", () => {
  it("flags MISSING_UNIT_PRICE (ERROR) for an unpriced PRICE_ITEM line", () => {
    const line = createLine();
    const result = computePricingControls([line]);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: ControlCode.MissingUnitPrice, severity: ControlSeverity.Error, pricingScheduleLineId: line.id }));
    expect(result.errorCount).toBe(1);
  });

  it("never flags a SECTION_HEADER/SUBTOTAL/NOTE line as missing a price", () => {
    const line = createLine({ kind: PricingScheduleLineKind.SectionHeader, quantity: undefined, unit: undefined, matchingKey: undefined });
    const result = computePricingControls([line]);
    expect(result.findings).toEqual([]);
  });

  it("no findings for a fully priced, coherent line", () => {
    const line = createLine();
    line.setUnitPrice({ unitPrice: "10", occurredAt: new Date() });
    const result = computePricingControls([line]);
    expect(result.findings).toEqual([]);
  });

  it("BLOQUANT — flags IncoherentUnit (WARNING) when quantity is set but unit is missing, never silently ignored", () => {
    const line = createLine({ unit: undefined });
    const result = computePricingControls([line]);
    expect(result.findings).toContainEqual(expect.objectContaining({ code: ControlCode.IncoherentUnit, severity: ControlSeverity.Warning }));
  });

  it("flags DuplicateLine (WARNING) for two lines sharing the same sheet + matchingKey", () => {
    const lineA = createLine();
    const lineB = createLine({ rowNumber: 8 });
    const result = computePricingControls([lineA, lineB]);
    const duplicates = result.findings.filter((f) => f.code === ControlCode.DuplicateLine);
    expect(duplicates).toHaveLength(2);
    expect(duplicates.every((f) => f.severity === ControlSeverity.Warning)).toBe(true);
  });

  it("BLOQUANT — flags AberrantRelativePrice (WARNING, never an auto-correction) for a price far from the version median", () => {
    const normalLines = [createLine({ matchingKey: "a" }), createLine({ matchingKey: "b", rowNumber: 4 }), createLine({ matchingKey: "c", rowNumber: 5 })];
    for (const line of normalLines) line.setUnitPrice({ unitPrice: "10", occurredAt: new Date() });
    const outlier = createLine({ matchingKey: "d", rowNumber: 6 });
    outlier.setUnitPrice({ unitPrice: "1000", occurredAt: new Date() });

    const result = computePricingControls([...normalLines, outlier]);
    const aberrant = result.findings.filter((f) => f.code === ControlCode.AberrantRelativePrice);
    expect(aberrant).toHaveLength(1);
    expect(aberrant[0]!.pricingScheduleLineId).toBe(outlier.id);
    expect(aberrant[0]!.severity).toBe(ControlSeverity.Warning);
  });

  it("counts errors/warnings/info independently", () => {
    const unpriced = createLine();
    const missingUnit = createLine({ unit: undefined, rowNumber: 9, matchingKey: "z" });
    const result = computePricingControls([unpriced, missingUnit]);
    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.warningCount).toBeGreaterThan(0);
    expect(result.infoCount).toBe(0);
  });
});
