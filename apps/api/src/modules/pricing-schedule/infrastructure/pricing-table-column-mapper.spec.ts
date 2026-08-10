import { describe, expect, it } from "vitest";
import { buildPricingFixtureBuffer } from "../test-support/build-pricing-fixture";
import { detectPricingTableColumnMapping } from "./pricing-table-column-mapper";
import { readXlsxWorkbook } from "./ooxml/xlsx-workbook-reader";

describe("detectPricingTableColumnMapping — real BPU fixture", () => {
  it("detects designation/unit/quantity/unitPrice columns from the real header row", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const mapping = detectPricingTableColumnMapping(workbook.sheets[0]!);
    expect(mapping).toEqual({
      headerRowNumber: 2,
      designationColumn: 1,
      unitColumn: 2,
      quantityColumn: 3,
      unitPriceColumn: 4,
      totalColumn: undefined,
      referenceColumn: undefined,
    });
  });

  it("BLOQUANT — a sheet with no recognizable unit-price header returns undefined, never a guessed mapping", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const mapping = detectPricingTableColumnMapping(workbook.sheets[1]!);
    expect(mapping).toBeUndefined();
  });
});
