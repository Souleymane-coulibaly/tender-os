import PizZip from "pizzip";
import { describe, expect, it } from "vitest";
import { buildPricingFixtureBuffer, PRICING_FIXTURE_REFERENCES as REF } from "../../test-support/build-pricing-fixture";
import { readXlsxWorkbook } from "./xlsx-workbook-reader";
import { UnsupportedXlsxStructureError, CorruptedXlsxFileError } from "../../domain/errors";

describe("readXlsxWorkbook — real hand-built XLSX fixture (styles, merges, shared strings, formula)", () => {
  it("reads both sheets in workbook-declared order, by name", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    expect(workbook.sheets.map((s) => s.name)).toEqual([REF.sheet1Name, REF.sheet2Name]);
  });

  it("resolves shared-string cells to their real text, never a raw index", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const sheet1 = workbook.sheets[0]!;
    const row2 = sheet1.rows.find((r) => r.rowNumber === 2)!;
    expect(row2.cells.map((c) => c.value)).toEqual(["Désignation", "Unité", "Quantité", "PU"]);
    const row3 = sheet1.rows.find((r) => r.rowNumber === 3)!;
    expect(row3.cells.find((c) => c.reference === "A3")?.value).toBe("Nettoyage des bureaux");
  });

  it("detects the merged title range", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    expect(workbook.sheets[0]!.mergedRanges).toEqual(["A1:D1"]);
  });

  it("BLOQUANT — detects a formula cell as type 'formula', never silently evaluated/overwritten by the reader", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const row5 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 5)!;
    const totalCell = row5.cells.find((c) => c.reference === REF.totalFormulaCell)!;
    expect(totalCell.type).toBe("formula");
    expect(totalCell.formula).toBe("D3+D4");
  });

  it("detects an empty (unfilled) price cell with its style index preserved, never invented as zero", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    const puCell = row3.cells.find((c) => c.reference === REF.puCellRow3)!;
    expect(puCell.type).toBe("empty");
    expect(puCell.value).toBeUndefined();
    expect(puCell.styleIndex).toBe(1);
  });

  it("reads numeric quantity cells as real numbers", () => {
    const workbook = readXlsxWorkbook(buildPricingFixtureBuffer());
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    expect(row3.cells.find((c) => c.reference === "C3")?.value).toBe(120);
  });

  it("BLOQUANT — throws CorruptedXlsxFileError for a non-ZIP buffer, never a silent empty result", () => {
    expect(() => readXlsxWorkbook(Buffer.from("not a zip file"))).toThrow(CorruptedXlsxFileError);
  });

  it("BLOQUANT — throws UnsupportedXlsxStructureError for a workbook with no sheets", () => {
    // Construit un ZIP minimal valide mais sans <sheet> déclaré.
    const zip = new PizZip();
    zip.file("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets/></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
    const buffer = zip.generate({ type: "nodebuffer" });
    expect(() => readXlsxWorkbook(buffer)).toThrow(UnsupportedXlsxStructureError);
  });
});
