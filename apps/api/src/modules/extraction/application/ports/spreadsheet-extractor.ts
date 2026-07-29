import type { StoredDocumentReference } from "./stored-document-reference";

export type SpreadsheetSheet = Readonly<{
  name: string;
  /** Représentation textuelle normalisée par feuille (mission §11) — une ligne par ligne de
   *  tableau, cellules séparées par une tabulation ; jamais une seule chaîne illisible pour tout
   *  le classeur. Cellules vides en fin de ligne retirées ; les feuilles trop grandes sont
   *  tronquées selon `EXTRACTION_MAX_CHARACTERS` (mission §11 "limites configurables"). */
  text: string;
  rowCount: number;
  columnCount: number;
  truncated: boolean;
}>;

export type SpreadsheetExtractionResult = Readonly<{
  sheets: readonly SpreadsheetSheet[];
  warnings: readonly string[];
}>;

/**
 * Extraction XLSX/XLS (mission Sprint 3 §11) — Workbook → Sheet → texte tabulaire normalisé.
 * Ne reconstruit jamais les formules elles-mêmes : seule la valeur calculée est extraite (une
 * feuille non recalculée expose sa dernière valeur mise en cache par le tableur d'origine).
 */
export interface SpreadsheetExtractor {
  extract(input: StoredDocumentReference): Promise<SpreadsheetExtractionResult>;
}

export const SPREADSHEET_EXTRACTOR = Symbol("SPREADSHEET_EXTRACTOR");
