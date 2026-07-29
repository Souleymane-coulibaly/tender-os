import { describe, expect, it } from "vitest";
import { DocumentExtractionStrategy } from "../domain/document-extraction-strategy";
import type { NormalizedExtractedContent } from "../domain/extracted-content";
import { DeterministicTextSegmenter } from "./deterministic-text-segmenter";

function content(units: NormalizedExtractedContent["units"]): NormalizedExtractedContent {
  return { documentId: "doc-1", strategy: DocumentExtractionStrategy.NativeText, units, warnings: [] };
}

describe("DeterministicTextSegmenter", () => {
  it("keeps a single short document as one chunk, in order, with a checksum-able content", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const drafts = await segmenter.segment(
      content([{ kind: "page", index: 1, text: "Paragraph one.\n\nParagraph two." }]),
      { maxChunkCharacters: 1000, overlapCharacters: 0 },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.sequence).toBe(0);
    expect(drafts[0]!.content).toBe("Paragraph one.\n\nParagraph two.");
    expect(drafts[0]!.pageStart).toBe(1);
    expect(drafts[0]!.pageEnd).toBe(1);
  });

  it("never cuts mid-word: an over-long paragraph is split at the last space before the limit", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const longWordish = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const drafts = await segmenter.segment(content([{ kind: "page", index: 1, text: longWordish }]), {
      maxChunkCharacters: 20,
      overlapCharacters: 0,
    });
    for (const draft of drafts) {
      expect(draft.content.length).toBeLessThanOrEqual(20);
      expect(draft.content.trim()).toBe(draft.content);
      expect(draft.content.startsWith(" ")).toBe(false);
      expect(draft.content.endsWith(" ")).toBe(false);
    }
    // Rejoindre les morceaux (sans le padding de jointure) doit reconstituer les mots d'origine.
    expect(drafts.map((d) => d.content).join(" ").replace(/\s+/g, " ")).toBe(longWordish);
  });

  it("enforces the configured maximum chunk size", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Paragraph number ${i} with some filler text.`).join(
      "\n\n",
    );
    const drafts = await segmenter.segment(content([{ kind: "page", index: 1, text: paragraphs }]), {
      maxChunkCharacters: 100,
      overlapCharacters: 0,
    });
    expect(drafts.length).toBeGreaterThan(1);
    for (const draft of drafts) {
      expect(draft.content.length).toBeLessThanOrEqual(100);
    }
  });

  it("carries a configurable overlap forward as whole trailing paragraphs", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const paragraphs = ["First paragraph here.", "Second paragraph here.", "Third paragraph here."].join("\n\n");
    const drafts = await segmenter.segment(content([{ kind: "page", index: 1, text: paragraphs }]), {
      maxChunkCharacters: 30,
      overlapCharacters: 15,
    });
    expect(drafts.length).toBeGreaterThan(1);
    // Le second chunk doit commencer par une partie du chunk précédent (chevauchement), jamais
    // par une coupure au milieu d'un mot.
    const overlapCandidate = drafts[1]!.content.split("\n\n")[0]!;
    expect(drafts[0]!.content).toContain(overlapCandidate);
  });

  it("never merges two different sheets into the same chunk (hard boundary)", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const drafts = await segmenter.segment(
      content([
        { kind: "sheet", index: 0, label: "Sheet A", text: "Row A1\n\nRow A2" },
        { kind: "sheet", index: 1, label: "Sheet B", text: "Row B1" },
      ]),
      { maxChunkCharacters: 1000, overlapCharacters: 0 },
    );
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    const sheetNames = drafts.map((d) => d.sheetName);
    expect(sheetNames).toContain("Sheet A");
    expect(sheetNames).toContain("Sheet B");
    const mixedChunk = drafts.find((d) => d.content.includes("Row A1") && d.content.includes("Row B1"));
    expect(mixedChunk).toBeUndefined();
  });

  it("allows a chunk to span multiple PDF pages (page is not a hard boundary)", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const drafts = await segmenter.segment(
      content([
        { kind: "page", index: 1, text: "Page one text." },
        { kind: "page", index: 2, text: "Page two text." },
      ]),
      { maxChunkCharacters: 1000, overlapCharacters: 0 },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.pageStart).toBe(1);
    expect(drafts[0]!.pageEnd).toBe(2);
  });

  it("never produces an empty chunk for whitespace-only or empty units", async () => {
    const segmenter = new DeterministicTextSegmenter();
    const drafts = await segmenter.segment(
      content([
        { kind: "page", index: 1, text: "" },
        { kind: "page", index: 2, text: "   " },
        { kind: "page", index: 3, text: "Real content." },
      ]),
      { maxChunkCharacters: 1000, overlapCharacters: 0 },
    );
    expect(drafts.every((d) => d.content.trim().length > 0)).toBe(true);
  });

  it("is deterministic: the same input produces byte-identical chunks across runs", async () => {
    const input = content([
      { kind: "page", index: 1, text: "Alpha.\n\nBeta.\n\nGamma delta epsilon zeta eta theta." },
      { kind: "page", index: 2, text: "Iota kappa lambda mu." },
    ]);
    const config = { maxChunkCharacters: 25, overlapCharacters: 5 };
    const first = await new DeterministicTextSegmenter().segment(input, config);
    const second = await new DeterministicTextSegmenter().segment(input, config);
    expect(second).toEqual(first);
  });

  it("preserves order via a strictly increasing sequence", async () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    const drafts = await new DeterministicTextSegmenter().segment(content([{ kind: "page", index: 1, text: paragraphs }]), {
      maxChunkCharacters: 20,
      overlapCharacters: 0,
    });
    const sequences = drafts.map((d) => d.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(new Set(sequences).size).toBe(sequences.length);
  });
});
