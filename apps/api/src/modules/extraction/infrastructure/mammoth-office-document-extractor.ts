import { Inject, Injectable } from "@nestjs/common";
import * as mammoth from "mammoth";
import { STORAGE_PROVIDER, type StorageProvider } from "../../documents";
import type {
  OfficeDocumentElement,
  OfficeDocumentExtractor,
  OfficeExtractionResult,
} from "../application/ports/office-document-extractor";
import type { StoredDocumentReference } from "../application/ports/stored-document-reference";
import { readStreamToBuffer } from "./read-stream-to-buffer";

const TOP_LEVEL_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p", "table", "ul", "ol"] as const;

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parseTableToText(tableHtml: string): string {
  const rows = [...tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((match) => match[1]!);
  return rows
    .map((row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => stripTags(cell[1]!)).join("\t"))
    .join("\n");
}

function parseListToText(listHtml: string): string {
  const items = [...listHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => stripTags(match[1]!));
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * Tokeniseur séquentiel volontairement simple (mission Sprint 3 §10 "conserve suffisamment de
 * structure... ne transforme pas tout en une chaîne brute") — jamais une reconstruction complète
 * de la mise en forme Word : opère sur le HTML plat produit par `mammoth.convertToHtml`, dont les
 * blocs de premier niveau (h1-h6/p/table/ul/ol) ne s'imbriquent jamais entre eux. Limite
 * documentée : une liste imbriquée dans une autre liste serait aplatie, jamais rejetée.
 */
function tokenizeTopLevelBlocks(html: string): OfficeDocumentElement[] {
  const elements: OfficeDocumentElement[] = [];
  let cursor = 0;

  while (cursor < html.length) {
    let nextTag: { tag: (typeof TOP_LEVEL_TAGS)[number]; start: number } | undefined;
    for (const tag of TOP_LEVEL_TAGS) {
      const index = html.indexOf(`<${tag}>`, cursor);
      if (index !== -1 && (!nextTag || index < nextTag.start)) {
        nextTag = { tag, start: index };
      }
    }
    if (!nextTag) {
      break;
    }

    const openTag = `<${nextTag.tag}>`;
    const closeTag = `</${nextTag.tag}>`;
    const contentStart = nextTag.start + openTag.length;
    const closeIndex = html.indexOf(closeTag, contentStart);
    if (closeIndex === -1) {
      break;
    }
    const innerHtml = html.slice(contentStart, closeIndex);

    if (nextTag.tag === "table") {
      elements.push({ kind: "table", text: parseTableToText(innerHtml) });
    } else if (nextTag.tag === "ul" || nextTag.tag === "ol") {
      elements.push({ kind: "list", text: parseListToText(innerHtml) });
    } else if (nextTag.tag === "p") {
      const text = stripTags(innerHtml);
      if (text.length > 0) {
        elements.push({ kind: "paragraph", text });
      }
    } else {
      elements.push({ kind: "heading", text: stripTags(innerHtml), level: Number(nextTag.tag.slice(1)) });
    }

    cursor = closeIndex + closeTag.length;
  }

  return elements;
}

@Injectable()
export class MammothOfficeDocumentExtractor implements OfficeDocumentExtractor {
  constructor(@Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider) {}

  async extract(input: StoredDocumentReference): Promise<OfficeExtractionResult> {
    const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(input.storageKey));
    const result = await mammoth.convertToHtml({ buffer });

    const elements = tokenizeTopLevelBlocks(result.value);
    const warnings = result.messages.filter((message) => message.type === "warning").map((message) => message.message);
    if (elements.length === 0) {
      warnings.push("the document produced no extractable element");
    }

    return { elements, warnings };
  }
}
