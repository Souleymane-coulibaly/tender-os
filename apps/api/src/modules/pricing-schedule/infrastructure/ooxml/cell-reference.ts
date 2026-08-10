/**
 * Coordonnées de cellule OOXML SpreadsheetML (mission Sprint 13 §16 "provenance cellule") — une
 * référence comme "E17" est purement une paire (colonne, ligne) ; jamais interprétée autrement.
 * Fonctions pures, aucune dépendance IO — réutilisées par le lecteur ET l'écrivain chirurgical.
 */

const CELL_REFERENCE_PATTERN = /^([A-Z]+)([1-9][0-9]*)$/;

export type CellCoordinates = Readonly<{ column: number; row: number }>;

/** "A" → 1, "Z" → 26, "AA" → 27, etc. — jamais 0-indexé (mission : correspond exactement à la
 *  numérotation Excel visible par l'utilisateur). */
export function columnLetterToIndex(letters: string): number {
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index;
}

export function columnIndexToLetter(index: number): string {
  let letters = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function parseCellReference(reference: string): CellCoordinates {
  const match = CELL_REFERENCE_PATTERN.exec(reference.toUpperCase());
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid XLSX cell reference: "${reference}"`);
  }
  return { column: columnLetterToIndex(match[1]), row: Number.parseInt(match[2], 10) };
}

export function formatCellReference(coordinates: CellCoordinates): string {
  return `${columnIndexToLetter(coordinates.column)}${coordinates.row}`;
}

export function isValidCellReference(reference: string): boolean {
  return CELL_REFERENCE_PATTERN.test(reference.toUpperCase());
}
