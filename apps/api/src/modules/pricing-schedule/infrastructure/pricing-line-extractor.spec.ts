import { describe, expect, it } from "vitest";
import { buildPricingFixtureBuffer } from "../test-support/build-pricing-fixture";
import { detectPricingTableColumnMapping } from "./pricing-table-column-mapper";
import { extractPricingLinesFromSheet } from "./pricing-line-extractor";
import { readXlsxWorkbook } from "./ooxml/xlsx-workbook-reader";
import { PricingScheduleLineKind } from "../domain/enums";

describe("extractPricingLinesFromSheet — real BPU fixture", () => {
  function extractSheet1Lines() {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const sheet = workbook.sheets[0]!;
    const mapping = detectPricingTableColumnMapping(sheet)!;
    return extractPricingLinesFromSheet(sheet, mapping);
  }

  it("BLOQUANT — extracts PRICE_ITEM lines with full cell provenance (mission §16)", () => {
    const lines = extractSheet1Lines();
    const row3 = lines.find((line) => line.rowNumber === 3)!;
    expect(row3.kind).toBe(PricingScheduleLineKind.PriceItem);
    expect(row3.designation).toBe("Nettoyage des bureaux");
    expect(row3.unit).toBe("m2");
    expect(row3.quantity).toBe("120");
    expect(row3.designationCellRef).toBe("A3");
    expect(row3.quantityCellRef).toBe("C3");
    expect(row3.buyerUnitPriceCellRef).toBe("D3");
    expect(row3.matchingKey).toBe("nettoyage des bureaux");
  });

  it("detects the TOTAL row (formula) as SUBTOTAL, never a priceable line", () => {
    const lines = extractSheet1Lines();
    const row5 = lines.find((line) => line.rowNumber === 5)!;
    expect(row5.kind).toBe(PricingScheduleLineKind.Subtotal);
    expect(row5.buyerUnitPriceCellRef).toBeUndefined();
    expect(row5.matchingKey).toBeUndefined();
  });

  it("skips the header row and the merged title row entirely", () => {
    const lines = extractSheet1Lines();
    expect(lines.some((line) => line.rowNumber === 1)).toBe(false);
    expect(lines.some((line) => line.rowNumber === 2)).toBe(false);
  });

  it("never invents a quantity from a formula cell", () => {
    const lines = extractSheet1Lines();
    const row5 = lines.find((line) => line.rowNumber === 5)!;
    expect(row5.quantity).toBeUndefined();
  });
});
