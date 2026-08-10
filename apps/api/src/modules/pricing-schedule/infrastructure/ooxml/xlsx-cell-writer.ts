/**
 * Écriture chirurgicale OOXML SpreadsheetML (mission Sprint 13, décision utilisateur explicite
 * "Chirurgie XML OOXML directe") — injecte UNIQUEMENT les valeurs numériques ciblées dans une COPIE
 * du classeur acheteur, sans jamais reconstruire un classeur depuis zéro. Mêmes garanties que
 * `docx-outline-extractor.ts` (Sprint 12) : les parties du fichier non ciblées (styles, feuilles,
 * cellules fusionnées, largeurs de colonnes, formules non ciblées, validations, lignes/colonnes
 * masquées, relations, métadonnées) restent OCTET POUR OCTET identiques à l'original — seule la
 * cellule `<c>` elle-même change, jamais rien autour.
 *
 * Aucune API générique "écris à la référence fournie par l'appelant" n'existe ici volontairement :
 * ce module n'est JAMAIS appelé directement depuis une route HTTP — uniquement depuis
 * `GenerateFinancialFileUseCase`, qui résout les cibles UNIQUEMENT depuis la provenance déjà
 * validée d'une `PricingScheduleVersion` (sourceDocumentVersionId + sheet + cell persistés à
 * l'extraction, jamais une valeur fournie par le frontend au moment de l'écriture).
 */
import PizZip from "pizzip";
import { UnsupportedXlsxStructureError } from "../../domain/errors";
import { parseCellReference } from "./cell-reference";

export type XlsxCellInjectionTarget = Readonly<{ sheetName: string; cellReference: string; numericValue: number }>;

function parseAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9:]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attributeString)) !== null) {
    if (match[1] && match[2] !== undefined) attributes[match[1]] = match[2];
  }
  return attributes;
}

type ElementSegment = Readonly<{ key: number; xml: string; attrs: Record<string, string>; inner: string | undefined }>;

/** Découpe une liste d'éléments frères `<TAG KEY="n" .../>` ou `<TAG KEY="n">...</TAG>` en
 *  segments ordonnés par leur attribut numérique `keyAttr` — motif générique partagé par `<row>`
 *  dans `<sheetData>` ET `<c>` dans `<row>` (même structure : liste plate d'éléments identifiés par
 *  un entier croissant, potentiellement creuse). */
function splitElementsByKey(xml: string, tagName: string, keyAttr: string): ElementSegment[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tagName}>)`, "g");
  const segments: ElementSegment[] = [];
  for (const match of xml.matchAll(pattern)) {
    const attrs = parseAttributes(match[1] ?? "");
    const keyRaw = attrs[keyAttr];
    if (!keyRaw) {
      throw new UnsupportedXlsxStructureError(`<${tagName}> element missing required "${keyAttr}" attribute`);
    }
    segments.push({ key: Number.parseInt(keyRaw, 10), xml: match[0], attrs, inner: match[2] });
  }
  return segments;
}

function buildReplacementCellXml(originalAttrs: Record<string, string>, cellReference: string, numericValue: number): string {
  // Jamais `t="s"/"str"/"inlineStr"/"b"/"e"` sur une valeur de prix numérique réelle (mission
  // "écrire une vraie valeur numérique, pas une chaîne formatée") — le type numérique est le
  // défaut OOXML quand `t` est absent, donc simplement omis ici. `s` (index de style) est
  // TOUJOURS préservé tel quel si présent — jamais réinitialisé.
  const styleAttr = originalAttrs.s !== undefined ? ` s="${originalAttrs.s}"` : "";
  return `<c r="${cellReference}"${styleAttr}><v>${numericValue}</v></c>`;
}

function patchRowXml(rowSegment: ElementSegment, cellsToInject: ReadonlyMap<number, number>): string {
  const rowAttrsXml = rowSegment.xml.slice(0, rowSegment.xml.indexOf(">") + 1);
  const existingCells = rowSegment.inner !== undefined ? splitElementsByKeyForCells(rowSegment.inner) : [];

  const patchedByColumn = new Map<number, string>();
  for (const cell of existingCells) {
    const targetValue = cellsToInject.get(cell.column);
    if (targetValue === undefined) {
      patchedByColumn.set(cell.column, cell.xml);
      continue;
    }
    if (cell.hasFormula) {
      throw new UnsupportedXlsxStructureError(`target cell "${cell.reference}" contains a formula — refusing to overwrite a buyer-provided formula`);
    }
    patchedByColumn.set(cell.column, buildReplacementCellXml(cell.attrs, cell.reference, targetValue));
  }

  // Cellules ciblées absentes du XML source (cellule creuse, jamais représentée) — insérées à la
  // bonne position (ordre des colonnes), jamais ajoutées en fin de ligne sans égard à l'ordre.
  for (const [column, value] of cellsToInject) {
    if (!patchedByColumn.has(column)) {
      const reference = `${columnIndexToLetterLocal(column)}${rowSegment.key}`;
      patchedByColumn.set(column, buildReplacementCellXml({}, reference, value));
    }
  }

  const orderedCellsXml = [...patchedByColumn.entries()].sort((a, b) => a[0] - b[0]).map(([, xml]) => xml).join("");
  return `${rowAttrsXml}${orderedCellsXml}</row>`;
}

type CellSegment = Readonly<{ column: number; reference: string; xml: string; attrs: Record<string, string>; hasFormula: boolean }>;

function splitElementsByKeyForCells(rowInner: string): CellSegment[] {
  const pattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const segments: CellSegment[] = [];
  for (const match of rowInner.matchAll(pattern)) {
    const attrs = parseAttributes(match[1] ?? "");
    const reference = attrs.r;
    if (!reference) {
      throw new UnsupportedXlsxStructureError("<c> element missing required \"r\" attribute");
    }
    const { column } = parseCellReference(reference);
    const inner = match[2] ?? "";
    segments.push({ column, reference, xml: match[0], attrs, hasFormula: /<f\b/.test(inner) });
  }
  return segments;
}

function columnIndexToLetterLocal(index: number): string {
  let letters = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function buildNewRowXml(rowNumber: number, cellsToInject: ReadonlyMap<number, number>): string {
  const cellsXml = [...cellsToInject.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([column, value]) => buildReplacementCellXml({}, `${columnIndexToLetterLocal(column)}${rowNumber}`, value))
    .join("");
  return `<row r="${rowNumber}">${cellsXml}</row>`;
}

/** Patch `<sheetData>...</sheetData>` — jamais rien d'autre dans le XML de la feuille (styles,
 *  merges, validations, colonnes, en-têtes/pieds de page restent intouchés car hors de cette
 *  sous-chaîne). */
function patchSheetDataXml(sheetXml: string, targetsByRow: ReadonlyMap<number, ReadonlyMap<number, number>>): string {
  const sheetDataMatch = /<sheetData(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(sheetXml);
  if (!sheetDataMatch) {
    throw new UnsupportedXlsxStructureError("worksheet has no <sheetData> element");
  }
  const sheetDataInner = sheetDataMatch[1] ?? "";
  const existingRows = splitElementsByKey(sheetDataInner, "row", "r");

  const patchedByRowNumber = new Map<number, string>();
  for (const row of existingRows) {
    const targets = targetsByRow.get(row.key);
    patchedByRowNumber.set(row.key, targets ? patchRowXml(row, targets) : row.xml);
  }
  for (const [rowNumber, targets] of targetsByRow) {
    if (!patchedByRowNumber.has(rowNumber)) {
      patchedByRowNumber.set(rowNumber, buildNewRowXml(rowNumber, targets));
    }
  }

  const orderedRowsXml = [...patchedByRowNumber.entries()].sort((a, b) => a[0] - b[0]).map(([, xml]) => xml).join("");
  const newSheetData = `<sheetData>${orderedRowsXml}</sheetData>`;
  return sheetXml.slice(0, sheetDataMatch.index) + newSheetData + sheetXml.slice(sheetDataMatch.index + sheetDataMatch[0].length);
}

function resolveSheetPathsForWrite(zip: PizZip): ReadonlyMap<string, string> {
  const workbookXml = zip.file("xl/workbook.xml")?.asText();
  const relsXml = zip.file("xl/_rels/workbook.xml.rels")?.asText();
  if (!workbookXml || !relsXml) {
    throw new UnsupportedXlsxStructureError("workbook.xml or its relationships part is missing");
  }
  const relIdToTarget = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1] ?? "");
    if (attrs.Id && attrs.Target) {
      const target = attrs.Target.startsWith("/") ? attrs.Target.slice(1) : `xl/${attrs.Target.replace(/^\.?\//, "")}`;
      relIdToTarget.set(attrs.Id, target);
    }
  }
  const nameToPath = new Map<string, string>();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1] ?? "");
    const relId = attrs["r:id"];
    if (attrs.name && relId) {
      const path = relIdToTarget.get(relId);
      if (path) nameToPath.set(attrs.name, path);
    }
  }
  return nameToPath;
}

/**
 * Injecte des valeurs numériques dans une COPIE du classeur original — jamais de mutation en
 * place, jamais un classeur reconstruit. Retourne un NOUVEAU buffer ; l'appelant (mission §9)
 * reste responsable de ne jamais réécrire le `DocumentVersion` source, uniquement d'en créer un
 * nouveau à partir du résultat.
 */
export function injectNumericCellValues(originalFileBuffer: Buffer, targets: readonly XlsxCellInjectionTarget[]): Buffer {
  if (targets.length === 0) {
    return Buffer.from(originalFileBuffer);
  }

  let zip: PizZip;
  try {
    zip = new PizZip(originalFileBuffer);
  } catch {
    throw new UnsupportedXlsxStructureError("the file could not be opened as a ZIP archive");
  }

  const sheetPaths = resolveSheetPathsForWrite(zip);

  const targetsBySheet = new Map<string, XlsxCellInjectionTarget[]>();
  for (const target of targets) {
    const list = targetsBySheet.get(target.sheetName) ?? [];
    list.push(target);
    targetsBySheet.set(target.sheetName, list);
  }

  for (const [sheetName, sheetTargets] of targetsBySheet) {
    const path = sheetPaths.get(sheetName);
    if (!path) {
      throw new UnsupportedXlsxStructureError(`sheet "${sheetName}" was not found in the workbook`);
    }
    const entry = zip.file(path);
    if (!entry) {
      throw new UnsupportedXlsxStructureError(`sheet "${sheetName}" references a missing part "${path}"`);
    }

    const targetsByRow = new Map<number, Map<number, number>>();
    for (const target of sheetTargets) {
      const { row, column } = parseCellReference(target.cellReference);
      const rowMap = targetsByRow.get(row) ?? new Map<number, number>();
      rowMap.set(column, target.numericValue);
      targetsByRow.set(row, rowMap);
    }

    const originalSheetXml = entry.asText();
    const patchedSheetXml = patchSheetDataXml(originalSheetXml, targetsByRow);
    zip.file(path, patchedSheetXml);
  }

  return zip.generate({ type: "nodebuffer" });
}
