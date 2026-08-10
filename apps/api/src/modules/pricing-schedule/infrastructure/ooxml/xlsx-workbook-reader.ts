/**
 * Lecture structurelle OOXML SpreadsheetML (mission Sprint 13 §10/§16) — lit directement le ZIP/XML
 * du classeur, JAMAIS via SheetJS pour cette partie (mission §48 "ne pas prétendre supporter des
 * fonctionnalités Excel non réellement prises en charge" — ici on lit exactement ce que le XML
 * contient : référence de cellule, type réel, formule non évaluée, index de style, cellules
 * fusionnées, lignes/colonnes masquées). SheetJS reste utilisé ailleurs (mission Sprint 3, module
 * `extraction`) pour l'extraction texte destinée à l'IA — un besoin différent, jamais fusionné ici.
 *
 * Même discipline que `docx-outline-extractor.ts` (Sprint 12) : lecture SEULE dans ce fichier,
 * aucune mutation. L'écriture chirurgicale vit exclusivement dans `xlsx-cell-writer.ts`.
 */
import PizZip from "pizzip";
import { CorruptedXlsxFileError, UnsupportedXlsxStructureError } from "../../domain/errors";
import { parseCellReference } from "./cell-reference";

export type XlsxCellType = "number" | "string" | "boolean" | "error" | "formula" | "empty";

export type XlsxCell = Readonly<{
  reference: string;
  row: number;
  column: number;
  type: XlsxCellType;
  /** Valeur résolue (texte partagé déjà résolu, nombre, booléen, code d'erreur) — jamais la
   *  formule elle-même pour `type === "formula"` (voir `formula`). */
  value: string | number | boolean | undefined;
  /** Présent uniquement si la cellule contient réellement une formule (`<f>`) — mission §31
   *  "conserver les formules... ne pas les remplacer inutilement". */
  formula?: string | undefined;
  styleIndex?: number | undefined;
}>;

export type XlsxRow = Readonly<{ rowNumber: number; hidden: boolean; cells: readonly XlsxCell[] }>;

export type XlsxSheet = Readonly<{
  name: string;
  rows: readonly XlsxRow[];
  mergedRanges: readonly string[];
  hiddenColumns: readonly number[];
}>;

export type XlsxWorkbook = Readonly<{ sheets: readonly XlsxSheet[] }>;

function parseAttributes(attributeString: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([a-zA-Z0-9:]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attributeString)) !== null) {
    if (match[1] && match[2] !== undefined) {
      attributes[match[1]] = decodeXmlEntities(match[2]);
    }
  }
  return attributes;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractSimpleTagText(xml: string, tagName: string): string | undefined {
  const match = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`).exec(xml);
  return match?.[1] !== undefined ? decodeXmlEntities(match[1]) : undefined;
}

/** `<is>` (inline string) peut contenir un `<t>` direct ou plusieurs `<r><t>...</t></r>` (texte
 *  enrichi) — toujours concaténé, jamais un seul run pris arbitrairement. */
function extractInlineStringText(xml: string): string | undefined {
  const runs = [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXmlEntities(m[1] ?? ""));
  return runs.length > 0 ? runs.join("") : undefined;
}

function parseSharedStrings(zip: PizZip): readonly string[] {
  const entry = zip.file("xl/sharedStrings.xml");
  if (!entry) return [];
  const xml = entry.asText();
  const entries = [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)];
  return entries.map((entry) => {
    const runs = [...(entry[1] ?? "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
    return runs.map((r) => decodeXmlEntities(r[1] ?? "")).join("");
  });
}

/** Résout name→chemin de fichier réel via `xl/workbook.xml` + `xl/_rels/workbook.xml.rels` —
 *  jamais une supposition de type "sheet1.xml == première feuille" (l'ordre des `r:id` n'est pas
 *  garanti identique à l'ordre des fichiers physiques). */
function resolveSheetPaths(zip: PizZip): readonly { name: string; path: string }[] {
  const workbookXml = zip.file("xl/workbook.xml")?.asText();
  if (!workbookXml) {
    throw new CorruptedXlsxFileError("xl/workbook.xml is missing");
  }
  const relsXml = zip.file("xl/_rels/workbook.xml.rels")?.asText();
  if (!relsXml) {
    throw new CorruptedXlsxFileError("xl/_rels/workbook.xml.rels is missing");
  }

  const relIdToTarget = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1] ?? "");
    if (attrs.Id && attrs.Target) {
      const target = attrs.Target.startsWith("/") ? attrs.Target.slice(1) : `xl/${attrs.Target.replace(/^\.?\//, "")}`;
      relIdToTarget.set(attrs.Id, target);
    }
  }

  const sheets: { name: string; path: string }[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1] ?? "");
    const relId = attrs["r:id"];
    const name = attrs.name;
    if (!name || !relId) continue;
    const path = relIdToTarget.get(relId);
    if (!path) {
      throw new UnsupportedXlsxStructureError(`sheet "${name}" has no resolvable relationship target`);
    }
    sheets.push({ name, path });
  }
  return sheets;
}

function parseMergedRanges(sheetXml: string): readonly string[] {
  return [...sheetXml.matchAll(/<mergeCell\s+ref="([^"]+)"/g)].map((m) => m[1]!);
}

function parseHiddenColumns(sheetXml: string): readonly number[] {
  const hidden: number[] = [];
  for (const match of sheetXml.matchAll(/<col\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1] ?? "");
    if (attrs.hidden === "1" && attrs.min && attrs.max) {
      const min = Number.parseInt(attrs.min, 10);
      const max = Number.parseInt(attrs.max, 10);
      for (let col = min; col <= max; col++) hidden.push(col);
    }
  }
  return hidden;
}

function parseCell(cellXml: string, reference: string, styleIndex: number | undefined, cellType: string | undefined): XlsxCell {
  const { column, row } = parseCellReference(reference);
  const formula = extractSimpleTagText(cellXml, "f");

  if (formula !== undefined) {
    const cachedValue = extractSimpleTagText(cellXml, "v");
    return { reference, row, column, type: "formula", value: cachedValue, formula, styleIndex };
  }

  if (cellType === "inlineStr") {
    return { reference, row, column, type: "string", value: extractInlineStringText(cellXml), styleIndex };
  }

  const rawValue = extractSimpleTagText(cellXml, "v");
  if (rawValue === undefined) {
    return { reference, row, column, type: "empty", value: undefined, styleIndex };
  }

  switch (cellType) {
    case "s":
      // Résolu par l'appelant (index → texte partagé) — voir `parseSheet`.
      return { reference, row, column, type: "string", value: rawValue, styleIndex };
    case "str":
      return { reference, row, column, type: "string", value: rawValue, styleIndex };
    case "b":
      return { reference, row, column, type: "boolean", value: rawValue === "1", styleIndex };
    case "e":
      return { reference, row, column, type: "error", value: rawValue, styleIndex };
    default: {
      const numeric = Number(rawValue);
      return { reference, row, column, type: "number", value: Number.isFinite(numeric) ? numeric : rawValue, styleIndex };
    }
  }
}

function parseSheet(name: string, sheetXml: string, sharedStrings: readonly string[]): XlsxSheet {
  const rows: XlsxRow[] = [];

  for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowAttrs = parseAttributes(rowMatch[1] ?? "");
    const rowNumberRaw = rowAttrs.r;
    if (!rowNumberRaw) continue;
    const rowNumber = Number.parseInt(rowNumberRaw, 10);
    const rowInner = rowMatch[2] ?? "";

    const cells: XlsxCell[] = [];
    for (const cellMatch of rowInner.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttrs = parseAttributes(cellMatch[1] ?? "");
      const reference = cellAttrs.r;
      if (!reference) continue;
      const styleIndex = cellAttrs.s !== undefined ? Number.parseInt(cellAttrs.s, 10) : undefined;
      const cellInner = cellMatch[2] ?? "";
      const cell = parseCell(cellInner, reference, styleIndex, cellAttrs.t);
      if (cell.type === "string" && cellAttrs.t === "s") {
        const index = Number.parseInt(String(cell.value), 10);
        cells.push({ ...cell, value: sharedStrings[index] ?? "" });
      } else {
        cells.push(cell);
      }
    }

    rows.push({ rowNumber, hidden: rowAttrs.hidden === "1", cells });
  }

  return { name, rows, mergedRanges: parseMergedRanges(sheetXml), hiddenColumns: parseHiddenColumns(sheetXml) };
}

export function readXlsxWorkbook(fileBuffer: Buffer): XlsxWorkbook {
  let zip: PizZip;
  try {
    zip = new PizZip(fileBuffer);
  } catch {
    throw new CorruptedXlsxFileError("the file could not be opened as a ZIP archive");
  }

  const sheetRefs = resolveSheetPaths(zip);
  if (sheetRefs.length === 0) {
    throw new UnsupportedXlsxStructureError("the workbook has no sheets");
  }
  const sharedStrings = parseSharedStrings(zip);

  const sheets = sheetRefs.map(({ name, path }) => {
    const entry = zip.file(path);
    if (!entry) {
      throw new UnsupportedXlsxStructureError(`sheet "${name}" references a missing part "${path}"`);
    }
    return parseSheet(name, entry.asText(), sharedStrings);
  });

  return { sheets };
}
