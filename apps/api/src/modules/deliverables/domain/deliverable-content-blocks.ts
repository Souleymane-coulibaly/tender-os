import type { RenderableBlock, RichTextRun } from "../../export";
import { InvalidDeliverableTemplateConfigError } from "./errors";

const MAX_BLOCKS = 500;
const MAX_TEXT_LENGTH = 20_000;
const MAX_RUNS_PER_BLOCK = 200;
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 30;
const MAX_LIST_ITEMS = 300;

/**
 * Mission Sprint 8A.1 §9 — "évite le HTML arbitraire" : le contenu structuré d'une révision est
 * TOUJOURS validé contre cette forme fermée avant d'être persisté (jamais une chaîne HTML/Markdown
 * de confiance). Réutilise l'IR `RenderableBlock` d'Export (§9 "aucune IR dupliquée") — cette
 * fonction est l'unique porte d'entrée : aucun autre chemin ne doit écrire `contentStructured`.
 * Un `href` n'est accepté que sous forme `http://`/`https://` absolue (mission "liens contrôlés").
 */
export function validateDeliverableContentBlocks(input: unknown): RenderableBlock[] {
  if (!Array.isArray(input)) {
    throw new InvalidDeliverableTemplateConfigError("content must be an array of blocks");
  }
  if (input.length > MAX_BLOCKS) {
    throw new InvalidDeliverableTemplateConfigError(`content must not exceed ${MAX_BLOCKS} blocks`);
  }
  return input.map((entry, index) => validateBlock(entry, index));
}

function validateBlock(entry: unknown, index: number): RenderableBlock {
  if (typeof entry !== "object" || entry === null) {
    throw new InvalidDeliverableTemplateConfigError(`content[${index}] must be an object`);
  }
  const block = entry as Record<string, unknown>;
  switch (block.kind) {
    case "heading": {
      const level = block.level;
      if (level !== 1 && level !== 2 && level !== 3) {
        throw new InvalidDeliverableTemplateConfigError(`content[${index}].level must be 1, 2 or 3`);
      }
      return { kind: "heading", level, text: validateText(block.text, index, "text") };
    }
    case "paragraph": {
      const text = validateText(block.text, index, "text");
      const runs = block.runs === undefined ? undefined : validateRuns(block.runs, index);
      return { kind: "paragraph", text, runs };
    }
    case "list": {
      if (!Array.isArray(block.items) || block.items.length === 0 || block.items.length > MAX_LIST_ITEMS) {
        throw new InvalidDeliverableTemplateConfigError(`content[${index}].items must be a non-empty array (max ${MAX_LIST_ITEMS})`);
      }
      const items = block.items.map((item, i) => validateText(item, index, `items[${i}]`));
      if (typeof block.ordered !== "boolean") {
        throw new InvalidDeliverableTemplateConfigError(`content[${index}].ordered must be a boolean`);
      }
      const itemRuns =
        block.itemRuns === undefined
          ? undefined
          : (() => {
              if (!Array.isArray(block.itemRuns)) {
                throw new InvalidDeliverableTemplateConfigError(`content[${index}].itemRuns must be an array`);
              }
              return block.itemRuns.map((entryRuns: unknown) => (entryRuns === undefined ? [] : validateRuns(entryRuns, index)));
            })();
      return { kind: "list", items, ordered: block.ordered, itemRuns };
    }
    case "table": {
      if (!Array.isArray(block.rows) || block.rows.length > MAX_TABLE_ROWS) {
        throw new InvalidDeliverableTemplateConfigError(`content[${index}].rows must be an array (max ${MAX_TABLE_ROWS} rows)`);
      }
      const rows = block.rows.map((row: unknown, r: number) => validateRow(row, index, r));
      const headerRow = block.headerRow === undefined ? undefined : validateRow(block.headerRow, index, -1);
      return { kind: "table", headerRow, rows };
    }
    case "pageBreak":
      return { kind: "pageBreak" };
    case "notice":
      return { kind: "notice", text: validateText(block.text, index, "text") };
    default:
      throw new InvalidDeliverableTemplateConfigError(`content[${index}].kind "${String(block.kind)}" is not a recognized block kind`);
  }
}

function validateRow(row: unknown, blockIndex: number, rowIndex: number): string[] {
  if (!Array.isArray(row) || row.length > MAX_TABLE_COLS) {
    throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].rows[${rowIndex}] must be an array (max ${MAX_TABLE_COLS} columns)`);
  }
  return row.map((cell, c) => validateText(cell, blockIndex, `rows[${rowIndex}][${c}]`));
}

function validateRuns(input: unknown, blockIndex: number): RichTextRun[] {
  if (!Array.isArray(input) || input.length > MAX_RUNS_PER_BLOCK) {
    throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].runs must be an array (max ${MAX_RUNS_PER_BLOCK})`);
  }
  return input.map((entry, i) => {
    if (typeof entry !== "object" || entry === null) {
      throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].runs[${i}] must be an object`);
    }
    const run = entry as Record<string, unknown>;
    const text = validateText(run.text, blockIndex, `runs[${i}].text`);
    if (run.bold !== undefined && typeof run.bold !== "boolean") {
      throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].runs[${i}].bold must be a boolean`);
    }
    if (run.italic !== undefined && typeof run.italic !== "boolean") {
      throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].runs[${i}].italic must be a boolean`);
    }
    let href: string | undefined;
    if (run.href !== undefined) {
      if (typeof run.href !== "string" || !/^https?:\/\/\S+$/.test(run.href) || run.href.length > 2000) {
        throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].runs[${i}].href must be an absolute http(s) URL`);
      }
      href = run.href;
    }
    return { text, bold: run.bold as boolean | undefined, italic: run.italic as boolean | undefined, href };
  });
}

function validateText(value: unknown, blockIndex: number, field: string): string {
  if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH) {
    throw new InvalidDeliverableTemplateConfigError(`content[${blockIndex}].${field} must be a string (max ${MAX_TEXT_LENGTH} characters)`);
  }
  return value;
}

/** Mission §9 "compteur de caractères" — mesure le contenu RÉELLEMENT rédigé (texte visible),
 *  jamais la taille sérialisée de la structure JSON. */
export function computeCharacterCount(blocks: readonly RenderableBlock[]): number {
  return blocksToPlainText(blocks).length;
}

/** Mission §7 — convertit le texte brut produit par une génération IA (Sprint 6,
 *  `Generation.generatedContent`/`editedContent`, une simple chaîne) en blocs structurés, en
 *  scindant sur les doubles sauts de ligne (même convention que `toParagraphBlocks` dans
 *  `export-assembly.service.ts`, Sprint 8A — dupliqué ici car privé à ce fichier et trivial,
 *  jamais un second moteur de génération). Point d'entrée UNIQUE pour transformer un contenu IA en
 *  `contentStructured` d'une révision. */
export function plainTextToBlocks(text: string): RenderableBlock[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  return paragraphs.length > 0 ? paragraphs.map((paragraph) => ({ kind: "paragraph" as const, text: paragraph })) : [{ kind: "paragraph" as const, text: "" }];
}

/** Équivalent texte brut, utilisé pour la recherche, l'aperçu sans mise en forme, et comme
 *  `contentText` persisté à côté de `contentStructured` (mission §9). */
export function blocksToPlainText(blocks: readonly RenderableBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
      case "paragraph":
      case "notice":
        parts.push(block.text);
        break;
      case "list":
        parts.push(...block.items);
        break;
      case "table":
        if (block.headerRow) parts.push(block.headerRow.join(" "));
        for (const row of block.rows) parts.push(row.join(" "));
        break;
      case "pageBreak":
        break;
    }
  }
  return parts.join("\n\n").trim();
}
