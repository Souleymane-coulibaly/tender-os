import { describe, expect, it } from "vitest";
import { validateGenerationCitation, validateGenerationCitations, type KnownKnowledgeReferences } from "./generation-citation-validator";

function knownRefs(): KnownKnowledgeReferences {
  return new Map([
    ["kb-1", { knowledgeEntryId: "kb-1", excerpt: "Our ISO 9001 certification was renewed in 2025." }],
    ["kb-2", { knowledgeEntryId: "kb-2", excerpt: "We have completed 12 similar public tenders since 2020." }],
  ]);
}

describe("generation-citation-validator", () => {
  it("accepts a citation whose knowledgeEntryId was actually supplied in context", () => {
    expect(() => validateGenerationCitation({ knowledgeEntryId: "kb-1" }, knownRefs())).not.toThrow();
  });

  it("accepts a citation text found verbatim in the referenced excerpt", () => {
    expect(() =>
      validateGenerationCitation({ knowledgeEntryId: "kb-1", citation: "ISO 9001 certification" }, knownRefs()),
    ).not.toThrow();
  });

  it("rejects a knowledgeEntryId never supplied to the prompt (hallucinated reference)", () => {
    expect(() => validateGenerationCitation({ knowledgeEntryId: "kb-999" }, knownRefs())).toThrow(
      /was not part of the context actually supplied/,
    );
  });

  it("rejects citation text not found verbatim in the known excerpt, even if the entry id is real", () => {
    expect(() =>
      validateGenerationCitation({ knowledgeEntryId: "kb-1", citation: "a completely fabricated sentence" }, knownRefs()),
    ).toThrow(/citation text .* was not found verbatim/);
  });

  it("validateGenerationCitations rejects on the first invalid citation among several", () => {
    expect(() =>
      validateGenerationCitations([{ knowledgeEntryId: "kb-1" }, { knowledgeEntryId: "kb-404" }], knownRefs()),
    ).toThrow();
  });
});
