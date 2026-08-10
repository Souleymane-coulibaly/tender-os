import type { XlsxCell, XlsxRow, XlsxSheet } from "./ooxml/xlsx-workbook-reader";
import type { PricingTableColumnMapping } from "./pricing-table-column-mapper";
import { PricingScheduleLineKind } from "../domain/enums";

/** Ligne extraite, encore sous forme de donnée brute — jamais un `PricingScheduleLine` du domaine
 *  directement (id/organizationId/pricingScheduleVersionId ne sont attribués que par le use-case
 *  appelant au moment de la persistance, même motif que le reste du dépôt : l'extraction reste pure
 *  et testable indépendamment de toute identité de version). */
export type ExtractedPricingLine = Readonly<{
  sheetName: string;
  rowNumber: number;
  kind: PricingScheduleLineKind;
  designation: string;
  unit?: string | undefined;
  quantity?: string | undefined;
  designationCellRef?: string | undefined;
  quantityCellRef?: string | undefined;
  buyerUnitPriceCellRef?: string | undefined;
  buyerTotalCellRef?: string | undefined;
  /** Non renseignée pour une ligne non tarifaire (mission §38 — le rapprochement BPU/DQE ne
   *  concerne que des lignes de prix réelles). */
  matchingKey?: string | undefined;
}>;

const SUBTOTAL_PATTERN = /^(sous)?total(general|ht|ttc)?$/;
const COMBINING_DIACRITICAL_MARKS = /[̀-ͯ]/g;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .trim();
}

function normalizeForMatchingKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function cellAt(row: XlsxRow, column: number | undefined): XlsxCell | undefined {
  if (column === undefined) return undefined;
  return row.cells.find((cell) => cell.column === column);
}

function textValue(cell: XlsxCell | undefined): string | undefined {
  if (!cell) return undefined;
  if (cell.type === "string" && typeof cell.value === "string") {
    const trimmed = cell.value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

/** Seule une cellule numérique RÉELLE (jamais une formule non évaluée, jamais une chaîne) est
 *  retenue comme quantité acheteur — mission §16 "provenance fiable", une quantité qui dépend d'une
 *  formule ne doit pas être figée sur une valeur en cache potentiellement obsolète. */
function numericValue(cell: XlsxCell | undefined): string | undefined {
  if (!cell || cell.type !== "number" || typeof cell.value !== "number") return undefined;
  return String(cell.value);
}

/**
 * Extrait les lignes d'un tableau de prix à partir d'un mapping déjà détecté/confirmé (mission
 * §15-§18). Limite honnête (mission "ne jamais prétendre supporter plus que ce qui est fait") :
 * cette heuristique distingue PRICE_ITEM / SUBTOTAL / SECTION_HEADER par la présence de données
 * chiffrées, mais ne produit jamais NOTE ni de hiérarchie DPGF au-delà du niveau 0 — un futur
 * complément (indentation, fusion de cellules) pourra enrichir `hierarchyLevel` sans changer cette
 * signature. Les lignes entièrement vides (aucune désignation ET aucune donnée chiffrée) sont
 * omises, jamais matérialisées comme une ligne vide inutile.
 */
export function extractPricingLinesFromSheet(sheet: XlsxSheet, mapping: PricingTableColumnMapping): readonly ExtractedPricingLine[] {
  const lines: ExtractedPricingLine[] = [];

  for (const row of sheet.rows) {
    if (row.rowNumber <= mapping.headerRowNumber) continue;

    const designationCell = cellAt(row, mapping.designationColumn);
    const designation = textValue(designationCell);
    const quantityCell = cellAt(row, mapping.quantityColumn);
    const unitPriceCell = cellAt(row, mapping.unitPriceColumn);
    const totalCell = cellAt(row, mapping.totalColumn);

    const hasAnyNumericData = numericValue(quantityCell) !== undefined || unitPriceCell !== undefined || totalCell !== undefined;
    if (!designation && !hasAnyNumericData) continue;

    const normalizedDesignation = designation ? normalizeText(designation).replace(/[^a-z]/g, "") : "";
    const unitCell = cellAt(row, mapping.unitColumn);

    if (designation && SUBTOTAL_PATTERN.test(normalizedDesignation)) {
      lines.push({ sheetName: sheet.name, rowNumber: row.rowNumber, kind: PricingScheduleLineKind.Subtotal, designation });
      continue;
    }

    const quantity = numericValue(quantityCell);
    const hasPriceableData = quantity !== undefined || unitPriceCell !== undefined || totalCell !== undefined;

    if (!hasPriceableData) {
      lines.push({ sheetName: sheet.name, rowNumber: row.rowNumber, kind: PricingScheduleLineKind.SectionHeader, designation: designation ?? "" });
      continue;
    }

    lines.push({
      sheetName: sheet.name,
      rowNumber: row.rowNumber,
      kind: PricingScheduleLineKind.PriceItem,
      designation: designation ?? "",
      unit: textValue(unitCell),
      quantity,
      designationCellRef: designationCell?.reference,
      quantityCellRef: quantityCell?.reference,
      buyerUnitPriceCellRef: unitPriceCell?.reference,
      buyerTotalCellRef: totalCell?.reference,
      matchingKey: designation ? normalizeForMatchingKey(designation) : undefined,
    });
  }

  return lines;
}
