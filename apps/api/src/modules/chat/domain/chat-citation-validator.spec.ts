import { describe, expect, it } from "vitest";
import { validateChatCitation, validateChatCitations, type KnownChatReferences } from "./chat-citation-validator";
import { ChatCitationValidationFailedError } from "./errors";
import { CitationSourceType } from "./message-citation.entity";

describe("chat-citation-validator", () => {
  const known: KnownChatReferences = new Map([
    ["TENDER:submissionDeadline", { sourceType: CitationSourceType.TenderField, label: "Date limite", content: "Date limite de remise des plis : 1er septembre 2026" }],
    ["DOC:doc-1:3", { sourceType: CitationSourceType.Document, documentId: "doc-1", chunkSequence: 3, label: "CCTP.pdf (p. 12)", content: "Le candidat doit fournir une attestation d'assurance décennale." }],
  ]);

  it("accepts a citation whose sourceRef was actually supplied", () => {
    const match = validateChatCitation({ sourceRef: "TENDER:submissionDeadline" }, known);
    expect(match.label).toBe("Date limite");
  });

  it("accepts a citation whose excerpt is found verbatim in the supplied content", () => {
    expect(() => validateChatCitation({ sourceRef: "DOC:doc-1:3", excerpt: "assurance décennale" }, known)).not.toThrow();
  });

  it("rejects a sourceRef never part of the supplied context (mission — never trust a model-declared source blindly)", () => {
    expect(() => validateChatCitation({ sourceRef: "DOC:doc-999:1" }, known)).toThrow(ChatCitationValidationFailedError);
  });

  it("rejects an excerpt that does not appear verbatim in the supplied content, even for a real sourceRef", () => {
    expect(() => validateChatCitation({ sourceRef: "DOC:doc-1:3", excerpt: "une clause qui n'existe pas dans cet extrait" }, known)).toThrow(ChatCitationValidationFailedError);
  });

  it("validateChatCitations validates every declared citation and fails on the first invalid one", () => {
    expect(() => validateChatCitations([{ sourceRef: "TENDER:submissionDeadline" }, { sourceRef: "KB:forged" }], known)).toThrow(ChatCitationValidationFailedError);
  });
});
