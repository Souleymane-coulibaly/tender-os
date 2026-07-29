import * as XLSX from "xlsx";

/** Construit un classeur XLSX réel (via la même bibliothèque que l'adaptateur, `xlsx`/SheetJS) —
 *  jamais un fichier binaire versionné : les tests d'extraction restent déterministes et
 *  hors-ligne. Accepte un tableau de feuilles `{ name, rows }`. */
export function buildMinimalXlsx(sheets: readonly { name: string; rows: readonly (readonly unknown[])[] }[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Classeur legacy .xls (format BIFF) — mêmes garanties que buildMinimalXlsx. */
export function buildMinimalXls(sheets: readonly { name: string; rows: readonly (readonly unknown[])[] }[]): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows as unknown[][]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
}
