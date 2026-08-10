import type { XlsxSheet } from "./ooxml/xlsx-workbook-reader";

/**
 * Détection du mapping colonnes d'un tableau de prix (mission §13/§14) — heuristique sur la ligne
 * d'en-têtes, jamais une position de colonne supposée fixe (mission "ne jamais supposer des
 * colonnes uniformes entre fichiers"). Reste EXPLICITE et corrigeable par l'utilisateur (mission
 * §14) : ce mapping n'est qu'une PROPOSITION initiale, jamais appliqué de façon irréversible — voir
 * `PricingScheduleVersion.mappingVersion`/`correctMapping`.
 */
export type PricingTableColumnMapping = Readonly<{
  headerRowNumber: number;
  designationColumn: number;
  unitColumn?: number | undefined;
  quantityColumn?: number | undefined;
  unitPriceColumn?: number | undefined;
  totalColumn?: number | undefined;
  referenceColumn?: number | undefined;
}>;

const DESIGNATION_KEYWORDS = new Set(["designation", "libelle", "description", "poste", "article", "nature", "prestation"]);
const UNIT_KEYWORDS = new Set(["unite", "u"]);
const QUANTITY_KEYWORDS = new Set(["quantite", "qte", "qt"]);
const UNIT_PRICE_KEYWORDS = new Set(["pu", "puht", "puttc", "prixunitaire", "prixunitairehtht", "prixunitaireht"]);
const TOTAL_KEYWORDS = new Set(["total", "montant", "montantht", "totalht", "prixtotal", "montanttotalht"]);
const REFERENCE_KEYWORDS = new Set(["ref", "reference", "code", "numero", "n"]);

const COMBINING_DIACRITICAL_MARKS = /[̀-ͯ]/g;

function normalizeHeaderText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_DIACRITICAL_MARKS, "")
    .replace(/[^a-z0-9]+/g, "");
}

const MAX_HEADER_SEARCH_ROWS = 20;

/** Retourne `undefined` si aucune ligne parmi les `MAX_HEADER_SEARCH_ROWS` premières ne contient à
 *  la fois une colonne "désignation" ET une colonne "prix unitaire" reconnues — jamais un mapping
 *  partiel deviné (mission "colonnes non mappées → NEEDS_REVIEW", jamais une extraction silencieuse
 *  sur une structure non reconnue). */
export function detectPricingTableColumnMapping(sheet: XlsxSheet): PricingTableColumnMapping | undefined {
  const candidateRows = sheet.rows.filter((row) => row.rowNumber <= MAX_HEADER_SEARCH_ROWS);

  for (const row of candidateRows) {
    let designationColumn: number | undefined;
    let unitColumn: number | undefined;
    let quantityColumn: number | undefined;
    let unitPriceColumn: number | undefined;
    let totalColumn: number | undefined;
    let referenceColumn: number | undefined;

    for (const cell of row.cells) {
      if (cell.type !== "string" || typeof cell.value !== "string") continue;
      const normalized = normalizeHeaderText(cell.value);
      if (normalized.length === 0) continue;

      if (designationColumn === undefined && DESIGNATION_KEYWORDS.has(normalized)) designationColumn = cell.column;
      else if (unitColumn === undefined && UNIT_KEYWORDS.has(normalized)) unitColumn = cell.column;
      else if (quantityColumn === undefined && QUANTITY_KEYWORDS.has(normalized)) quantityColumn = cell.column;
      else if (unitPriceColumn === undefined && UNIT_PRICE_KEYWORDS.has(normalized)) unitPriceColumn = cell.column;
      else if (totalColumn === undefined && TOTAL_KEYWORDS.has(normalized)) totalColumn = cell.column;
      else if (referenceColumn === undefined && REFERENCE_KEYWORDS.has(normalized)) referenceColumn = cell.column;
    }

    if (designationColumn !== undefined && unitPriceColumn !== undefined) {
      return { headerRowNumber: row.rowNumber, designationColumn, unitColumn, quantityColumn, unitPriceColumn, totalColumn, referenceColumn };
    }
  }

  return undefined;
}
