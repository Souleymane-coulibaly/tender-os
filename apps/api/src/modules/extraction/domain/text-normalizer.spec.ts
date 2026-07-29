import { describe, expect, it } from "vitest";
import { DocumentExtractionStrategy } from "./document-extraction-strategy";
import type { ExtractedContent } from "./extracted-content";
import { normalizeExtractedContent } from "./text-normalizer";

function content(units: ExtractedContent["units"]): ExtractedContent {
  return { documentId: "doc-1", strategy: DocumentExtractionStrategy.NativeText, units, warnings: [] };
}

describe("normalizeExtractedContent", () => {
  it("normalizes CRLF to LF and collapses runs of spaces/tabs", () => {
    const result = normalizeExtractedContent(content([{ kind: "page", index: 1, text: "Hello\r\nWorld   \t\tfoo" }]));
    expect(result.units[0]!.text).toBe("Hello\nWorld foo");
  });

  it("strips control characters (kept out of the C0 stripping range: newline)", () => {
    const withControlChars = "A" + String.fromCharCode(1) + String.fromCharCode(7) + "B\nC";
    const result = normalizeExtractedContent(content([{ kind: "page", index: 1, text: withControlChars }]));
    expect(result.units[0]!.text).toBe("AB\nC");
  });

  it("joins PDF hyphenation only when followed by a lowercase letter", () => {
    const result = normalizeExtractedContent(
      content([{ kind: "page", index: 1, text: "This docu-\nment continues, but NOT-\nEND-OF-SENTENCE." }]),
    );
    expect(result.units[0]!.text).toContain("document continues");
    expect(result.units[0]!.text).toContain("NOT-\nEND-OF-SENTENCE");
  });

  it("collapses 3+ consecutive blank lines to a single blank line", () => {
    const result = normalizeExtractedContent(content([{ kind: "page", index: 1, text: "A\n\n\n\n\nB" }]));
    expect(result.units[0]!.text).toBe("A\n\nB");
  });

  it("never destroys structure metadata: kind/index/label are untouched, only text changes", () => {
    const result = normalizeExtractedContent(
      content([{ kind: "sheet", index: 2, label: "Budget", text: "  raw  " }]),
    );
    expect(result.units[0]).toMatchObject({ kind: "sheet", index: 2, label: "Budget", text: "raw" });
  });

  it("keeps an empty page present (with empty text) rather than removing the unit", () => {
    const result = normalizeExtractedContent(content([{ kind: "page", index: 1, text: "   " }]));
    expect(result.units).toHaveLength(1);
    expect(result.units[0]!.text).toBe("");
  });

  it("strips a header/footer line repeated on more than half of at least 3 pages", () => {
    const result = normalizeExtractedContent(
      content([
        { kind: "page", index: 1, text: "CONFIDENTIAL\nBody one\nCONFIDENTIAL" },
        { kind: "page", index: 2, text: "CONFIDENTIAL\nBody two" },
        { kind: "page", index: 3, text: "CONFIDENTIAL\nBody three" },
        { kind: "page", index: 4, text: "Body four (no header)" },
      ]),
    );
    for (const unit of result.units) {
      expect(unit.text).not.toContain("CONFIDENTIAL");
    }
    expect(result.units[0]!.text).toBe("Body one");
  });

  it("never strips a line that only appears on a minority of pages", () => {
    const result = normalizeExtractedContent(
      content([
        { kind: "page", index: 1, text: "Rare line\nBody one" },
        { kind: "page", index: 2, text: "Body two" },
        { kind: "page", index: 3, text: "Body three" },
      ]),
    );
    expect(result.units[0]!.text).toContain("Rare line");
  });

  it("never strips repeated lines from sheet/section units (page-only heuristic)", () => {
    const result = normalizeExtractedContent(
      content([
        { kind: "sheet", index: 1, label: "S1", text: "TOTAL\nrow" },
        { kind: "sheet", index: 2, label: "S2", text: "TOTAL\nrow" },
        { kind: "sheet", index: 3, label: "S3", text: "TOTAL\nrow" },
      ]),
    );
    for (const unit of result.units) {
      expect(unit.text).toContain("TOTAL");
    }
  });
});
