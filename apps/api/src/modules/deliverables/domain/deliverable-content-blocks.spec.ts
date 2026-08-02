import { describe, expect, it } from "vitest";
import { blocksToPlainText, computeCharacterCount, validateDeliverableContentBlocks } from "./deliverable-content-blocks";

describe("validateDeliverableContentBlocks", () => {
  it("accepts a well-formed mix of block kinds", () => {
    const blocks = validateDeliverableContentBlocks([
      { kind: "heading", level: 1, text: "Titre" },
      { kind: "paragraph", text: "Paragraphe", runs: [{ text: "gras", bold: true }] },
      { kind: "list", items: ["a", "b"], ordered: false },
      { kind: "table", headerRow: ["A", "B"], rows: [["1", "2"]] },
      { kind: "pageBreak" },
      { kind: "notice", text: "Attention" },
    ]);
    expect(blocks).toHaveLength(6);
  });

  it("rejects a non-array input", () => {
    expect(() => validateDeliverableContentBlocks("<script>alert(1)</script>")).toThrow();
  });

  it("rejects an unrecognized block kind — never a passthrough of arbitrary HTML", () => {
    expect(() => validateDeliverableContentBlocks([{ kind: "html", raw: "<b>x</b>" }])).toThrow();
  });

  it("rejects a heading with an invalid level", () => {
    expect(() => validateDeliverableContentBlocks([{ kind: "heading", level: 4, text: "x" }])).toThrow();
  });

  it("rejects a run href that is not an absolute http(s) URL", () => {
    expect(() =>
      validateDeliverableContentBlocks([{ kind: "paragraph", text: "x", runs: [{ text: "lien", href: "ftp://example.org" }] }]),
    ).toThrow();
    expect(() =>
      validateDeliverableContentBlocks([{ kind: "paragraph", text: "x", runs: [{ text: "lien", href: "/relative/path" }] }]),
    ).toThrow();
  });

  it("accepts an absolute https href", () => {
    const blocks = validateDeliverableContentBlocks([{ kind: "paragraph", text: "x", runs: [{ text: "lien", href: "https://example.org/preuve" }] }]);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
  });

  it("rejects an empty list", () => {
    expect(() => validateDeliverableContentBlocks([{ kind: "list", items: [], ordered: false }])).toThrow();
  });

  it("rejects too many blocks", () => {
    const many = Array.from({ length: 501 }, () => ({ kind: "paragraph", text: "x" }));
    expect(() => validateDeliverableContentBlocks(many)).toThrow();
  });
});

describe("blocksToPlainText / computeCharacterCount", () => {
  it("concatenates textual content across block kinds, ignoring structural blocks", () => {
    const blocks = validateDeliverableContentBlocks([
      { kind: "heading", level: 1, text: "Titre" },
      { kind: "paragraph", text: "Bonjour" },
      { kind: "list", items: ["un", "deux"], ordered: false },
      { kind: "pageBreak" },
    ]);
    const text = blocksToPlainText(blocks);
    expect(text).toContain("Titre");
    expect(text).toContain("Bonjour");
    expect(text).toContain("un");
    expect(text).toContain("deux");
    expect(computeCharacterCount(blocks)).toBe(text.length);
  });

  it("returns an empty string for an empty block list", () => {
    expect(blocksToPlainText([])).toBe("");
    expect(computeCharacterCount([])).toBe(0);
  });
});
