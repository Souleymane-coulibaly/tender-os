import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildPricingFixtureBuffer, PRICING_FIXTURE_REFERENCES as REF } from "../../test-support/build-pricing-fixture";
import { UnsupportedXlsxStructureError } from "../../domain/errors";
import { injectNumericCellValues } from "./xlsx-cell-writer";
import { readXlsxWorkbook } from "./xlsx-workbook-reader";

describe("injectNumericCellValues — chirurgie OOXML sur fixture XLSX réelle", () => {
  it("BLOQUANT — injects a real numeric value into an empty target cell, never a formatted string", () => {
    const original = buildPricingFixtureBuffer();
    const patched = injectNumericCellValues(original, [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);

    const workbook = readXlsxWorkbook(patched);
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    const puCell = row3.cells.find((c) => c.reference === REF.puCellRow3)!;
    expect(puCell.type).toBe("number");
    expect(puCell.value).toBe(1.2);
  });

  it("BLOQUANT — multiple sheets: injecting into sheet1 leaves sheet2 (DQE) content byte-for-byte identical", () => {
    const original = buildPricingFixtureBuffer();
    const originalWorkbook = readXlsxWorkbook(original);
    const patched = injectNumericCellValues(original, [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    const patchedWorkbook = readXlsxWorkbook(patched);

    expect(patchedWorkbook.sheets[1]).toEqual(originalWorkbook.sheets[1]);
  });

  it("BLOQUANT — preserves the cell's style index (s=\"1\") after injection, never resets it", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    const workbook = readXlsxWorkbook(patched);
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    expect(row3.cells.find((c) => c.reference === REF.puCellRow3)?.styleIndex).toBe(1);
  });

  it("BLOQUANT — a formula elsewhere in the sheet (not targeted) is preserved exactly, never recalculated or stripped", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 },
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow4, numericValue: 3.5 },
    ]);
    const workbook = readXlsxWorkbook(patched);
    const row5 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 5)!;
    const totalCell = row5.cells.find((c) => c.reference === REF.totalFormulaCell)!;
    expect(totalCell.type).toBe("formula");
    expect(totalCell.formula).toBe("D3+D4");
  });

  it("BLOQUANT — merged cells are preserved exactly after injection", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    const workbook = readXlsxWorkbook(patched);
    expect(workbook.sheets[0]!.mergedRanges).toEqual(["A1:D1"]);
  });

  it("BLOQUANT — shared-string cells elsewhere are untouched (still resolve to the same text)", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    const workbook = readXlsxWorkbook(patched);
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    expect(row3.cells.find((c) => c.reference === REF.designationCellRow3)?.value).toBe("Nettoyage des bureaux");
  });

  it("preserves decimal precision exactly (never rounded to 2 decimals silently)", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2345 }]);
    const workbook = readXlsxWorkbook(patched);
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    expect(row3.cells.find((c) => c.reference === REF.puCellRow3)?.value).toBe(1.2345);
  });

  it("an empty target list returns the workbook unchanged (no targets = no writes)", () => {
    const original = buildPricingFixtureBuffer();
    const patched = injectNumericCellValues(original, []);
    expect(readXlsxWorkbook(patched)).toEqual(readXlsxWorkbook(original));
  });

  it("BLOQUANT — injects multiple prices in a single call, all applied correctly, row/other-cell order intact", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 },
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow4, numericValue: 3.5 },
    ]);
    const workbook = readXlsxWorkbook(patched);
    const row3 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 3)!;
    const row4 = workbook.sheets[0]!.rows.find((r) => r.rowNumber === 4)!;
    expect(row3.cells.find((c) => c.reference === REF.puCellRow3)?.value).toBe(1.2);
    expect(row4.cells.find((c) => c.reference === REF.puCellRow4)?.value).toBe(3.5);
    // Ordre des cellules dans la ligne toujours par colonne croissante.
    expect(row3.cells.map((c) => c.reference)).toEqual(["A3", "B3", "C3", "D3"]);
  });

  it("BLOQUANT — refuses to overwrite a formula cell, throws UnsupportedXlsxStructureError rather than silently discarding the formula", () => {
    expect(() =>
      injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: REF.sheet1Name, cellReference: REF.totalFormulaCell, numericValue: 999 }]),
    ).toThrow(UnsupportedXlsxStructureError);
  });

  it("BLOQUANT — an unknown sheet name is refused explicitly, never silently ignored", () => {
    expect(() =>
      injectNumericCellValues(buildPricingFixtureBuffer(), [{ sheetName: "Feuille inexistante", cellReference: "A1", numericValue: 1 }]),
    ).toThrow(UnsupportedXlsxStructureError);
  });

  it("BLOQUANT — only the authorized target cells change value; every other cell in the workbook is identical", () => {
    const original = buildPricingFixtureBuffer();
    const originalWorkbook = readXlsxWorkbook(original);
    const patched = injectNumericCellValues(original, [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    const patchedWorkbook = readXlsxWorkbook(patched);

    const changedCells: string[] = [];
    for (let sheetIndex = 0; sheetIndex < originalWorkbook.sheets.length; sheetIndex++) {
      const originalSheet = originalWorkbook.sheets[sheetIndex]!;
      const patchedSheet = patchedWorkbook.sheets[sheetIndex]!;
      for (const originalRow of originalSheet.rows) {
        const patchedRow = patchedSheet.rows.find((r) => r.rowNumber === originalRow.rowNumber)!;
        for (const originalCell of originalRow.cells) {
          const patchedCell = patchedRow.cells.find((c) => c.reference === originalCell.reference);
          if (JSON.stringify(patchedCell) !== JSON.stringify(originalCell)) {
            changedCells.push(`${originalSheet.name}!${originalCell.reference}`);
          }
        }
      }
    }
    expect(changedCells).toEqual([`${REF.sheet1Name}!${REF.puCellRow3}`]);
  });

  it("BLOQUANT — the final XLSX is reopenable by an independent library (SheetJS), not just by our own reader", () => {
    const patched = injectNumericCellValues(buildPricingFixtureBuffer(), [
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 },
      { sheetName: REF.sheet1Name, cellReference: REF.puCellRow4, numericValue: 3.5 },
    ]);
    const workbook = XLSX.read(patched, { type: "buffer" });
    expect(workbook.SheetNames).toEqual([REF.sheet1Name, REF.sheet2Name]);
    const sheet = workbook.Sheets[REF.sheet1Name]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    // Ligne 3 (index 2) : désignation, unité, quantité, PU injecté.
    expect(rows[2]).toEqual(["Nettoyage des bureaux", "m2", 120, 1.2]);
  });

  it("never mutates the original buffer passed in", () => {
    const original = buildPricingFixtureBuffer();
    const originalCopy = Buffer.from(original);
    injectNumericCellValues(original, [{ sheetName: REF.sheet1Name, cellReference: REF.puCellRow3, numericValue: 1.2 }]);
    expect(original.equals(originalCopy)).toBe(true);
  });
});
