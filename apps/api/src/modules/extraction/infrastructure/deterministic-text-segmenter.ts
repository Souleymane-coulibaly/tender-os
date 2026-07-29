import { Injectable } from "@nestjs/common";
import type { ExtractedContentUnit, NormalizedExtractedContent } from "../domain/extracted-content";
import type { SegmentationConfig, SegmentedChunkDraft, TextSegmenter } from "../application/ports/text-segmenter";

type Paragraph = Readonly<{ text: string; unit: ExtractedContentUnit }>;

function splitIntoParagraphs(content: NormalizedExtractedContent): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const unit of content.units) {
    if (unit.text.trim().length === 0) {
      continue;
    }
    const blocks = unit.text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0);
    for (const block of blocks) {
      paragraphs.push({ text: block, unit });
    }
  }
  return paragraphs;
}

/** Découpe un paragraphe trop long au dernier espace avant la limite (mission §13 "ne coupe pas
 *  arbitrairement au milieu d'un mot") — jamais une coupure à taille fixe aveugle. */
function splitLongParagraph(text: string, maxCharacters: number): string[] {
  if (text.length <= maxCharacters) {
    return [text];
  }
  const pieces: string[] = [];
  let remaining = text;
  while (remaining.length > maxCharacters) {
    let cut = remaining.lastIndexOf(" ", maxCharacters);
    if (cut <= 0) {
      cut = maxCharacters; // aucun espace trouvé (mot unique très long) : coupure de dernier recours.
    }
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining.length > 0) {
    pieces.push(remaining);
  }
  return pieces;
}

/** `undefined` pour les pages (un chunk peut légitimement franchir une frontière de page — la
 *  prose continue), une clé stable pour feuille/section (mission §13 : jamais fusionner deux
 *  feuilles/sections différentes dans le même chunk). */
function boundaryKey(unit: ExtractedContentUnit): string | undefined {
  if (unit.kind === "page") {
    return undefined;
  }
  return `${unit.kind}:${unit.label ?? unit.index}`;
}

function buildDraft(sequence: number, paragraphs: readonly Paragraph[]): SegmentedChunkDraft | null {
  const text = paragraphs.map((paragraph) => paragraph.text).join("\n\n").trim();
  if (text.length === 0) {
    return null;
  }
  const units = paragraphs.map((paragraph) => paragraph.unit);
  const pageUnits = units.filter((unit) => unit.kind === "page");
  const sheetUnit = units.find((unit) => unit.kind === "sheet");
  const sectionUnit = units.find((unit) => unit.kind === "section");

  return {
    sequence,
    pageStart: pageUnits.length > 0 ? Math.min(...pageUnits.map((unit) => unit.index)) : undefined,
    pageEnd: pageUnits.length > 0 ? Math.max(...pageUnits.map((unit) => unit.index)) : undefined,
    sheetName: sheetUnit?.label,
    sectionTitle: sectionUnit?.label,
    content: text,
    // Heuristique volontairement simple (mission §13 "tokenEstimate éventuel") : ~4 caractères par
    // token en moyenne pour un texte latin — jamais un tokenizer réel branché dans ce sprint.
    tokenEstimate: Math.ceil(text.length / 4),
  };
}

/**
 * Segmentation déterministe (mission Sprint 3 §13) — même paragraphes en entrée, mêmes chunks en
 * sortie, toujours. Ne branche aucun modèle d'embeddings (hors périmètre explicite).
 */
@Injectable()
export class DeterministicTextSegmenter implements TextSegmenter {
  async segment(content: NormalizedExtractedContent, config: SegmentationConfig): Promise<SegmentedChunkDraft[]> {
    const paragraphs = splitIntoParagraphs(content);
    const drafts: SegmentedChunkDraft[] = [];
    let buffer: Paragraph[] = [];
    let bufferLength = 0;
    let previousBoundary: string | undefined;

    const flush = (): void => {
      const draft = buildDraft(drafts.length, buffer);
      if (draft) {
        drafts.push(draft);
      }
      buffer = [];
      bufferLength = 0;
    };

    const carryOverlap = (flushedParagraphs: readonly Paragraph[]): void => {
      if (config.overlapCharacters <= 0) {
        return;
      }
      let carried = 0;
      const tail: Paragraph[] = [];
      for (let i = flushedParagraphs.length - 1; i >= 0 && carried < config.overlapCharacters; i -= 1) {
        tail.unshift(flushedParagraphs[i]!);
        carried += flushedParagraphs[i]!.text.length;
      }
      for (const paragraph of tail) {
        buffer.push(paragraph);
        bufferLength += paragraph.text.length + 2;
      }
    };

    for (const paragraph of paragraphs) {
      const boundary = boundaryKey(paragraph.unit);
      if (boundary !== undefined && boundary !== previousBoundary && buffer.length > 0) {
        const flushed = buffer;
        flush();
        void flushed; // frontière de feuille/section : jamais de chevauchement reporté au-delà.
      }
      previousBoundary = boundary ?? previousBoundary;

      for (const piece of splitLongParagraph(paragraph.text, config.maxChunkCharacters)) {
        const pieceParagraph: Paragraph = { text: piece, unit: paragraph.unit };
        const wouldOverflow = bufferLength + piece.length + 2 > config.maxChunkCharacters && buffer.length > 0;
        if (wouldOverflow) {
          const flushed = buffer;
          flush();
          carryOverlap(flushed);
        }
        buffer.push(pieceParagraph);
        bufferLength += piece.length + 2;
      }
    }
    flush();

    return drafts;
  }
}
