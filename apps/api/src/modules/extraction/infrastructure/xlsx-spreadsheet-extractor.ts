import { Inject, Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";
import { STORAGE_PROVIDER, type StorageProvider } from "../../documents";
import { CorruptedDocumentError, SpreadsheetLimitExceededError } from "../domain/extraction-errors";
import type {
  SpreadsheetExtractor,
  SpreadsheetExtractionResult,
  SpreadsheetSheet,
} from "../application/ports/spreadsheet-extractor";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";
import { EXTRACTION_CONFIG, type ExtractionConfig } from "./extraction-config";
import { readStreamToBuffer } from "./read-stream-to-buffer";

/**
 * Extraction XLSX/XLS via `xlsx` (SheetJS) — mission Sprint 3 §11. `sheet_to_json` avec
 * `raw:false` restitue la valeur CALCULÉE mise en cache par le tableur d'origine pour toute
 * cellule formule (jamais la formule elle-même) — satisfait "formules et valeurs calculées
 * lorsque disponibles" sans traitement supplémentaire. Chaque feuille devient un texte tabulaire
 * normalisé (une ligne par ligne, cellules séparées par une tabulation), jamais une chaîne unique
 * illisible pour tout le classeur.
 */
@Injectable()
export class XlsxSpreadsheetExtractor implements SpreadsheetExtractor {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(EXTRACTION_CONFIG) private readonly config: ExtractionConfig,
  ) {}

  async extract(input: StoredDocumentReference): Promise<SpreadsheetExtractionResult> {
    const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(input.storageKey));

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
      throw new CorruptedDocumentError({ reason: "the spreadsheet could not be parsed" });
    }

    if (workbook.SheetNames.length === 0) {
      throw new CorruptedDocumentError({ reason: "the workbook has no sheet" });
    }
    // Correction P1-03 — refusé AVANT de construire le texte de la moindre feuille : jamais un
    // classeur à 500 feuilles traité en silence jusqu'à épuiser la mémoire.
    if (workbook.SheetNames.length > this.config.extractionMaxSheets) {
      throw new SpreadsheetLimitExceededError({
        reason: `workbook has ${workbook.SheetNames.length} sheets, exceeding the configured maximum of ${this.config.extractionMaxSheets}`,
      });
    }

    const warnings: string[] = [];
    const sheets: SpreadsheetSheet[] = workbook.SheetNames.map((name) => {
      const worksheet = workbook.Sheets[name];
      const rows = (
        worksheet ? XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "" }) : []
      ).filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0));

      // Correction P1-03 — refusé avant de joindre les lignes en texte, jamais après.
      if (rows.length > this.config.extractionMaxRowsPerSheet) {
        throw new SpreadsheetLimitExceededError({
          reason:
            `sheet "${name}" has ${rows.length} rows, exceeding the configured maximum of ` +
            `${this.config.extractionMaxRowsPerSheet}`,
        });
      }

      let text = rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n");
      let truncated = false;
      if (text.length > this.config.extractionMaxCharacters) {
        text = text.slice(0, this.config.extractionMaxCharacters);
        truncated = true;
        warnings.push(`sheet "${name}" truncated to ${this.config.extractionMaxCharacters} characters`);
      }

      const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
      return { name, text, rowCount: rows.length, columnCount, truncated };
    });

    if (sheets.every((sheet) => sheet.text.length === 0)) {
      warnings.push("the workbook produced no extractable content");
    }

    return { sheets, warnings };
  }
}
