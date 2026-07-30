import { describe, expect, it } from "vitest";
import { ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS, isKnowledgeEntryStatus, KnowledgeEntryStatus, parseKnowledgeEntryStatus } from "./knowledge-entry-status";
import { InvalidKnowledgeEntryStatusError } from "./errors";

describe("KnowledgeEntryStatus transitions", () => {
  it("allows DRAFT -> PROCESSING/READY/ARCHIVED", () => {
    expect(ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS[KnowledgeEntryStatus.Draft]).toEqual(
      expect.arrayContaining([KnowledgeEntryStatus.Processing, KnowledgeEntryStatus.Ready, KnowledgeEntryStatus.Archived]),
    );
  });

  it("allows PROCESSING -> READY/PARTIALLY_READY/FAILED/ARCHIVED", () => {
    expect(ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS[KnowledgeEntryStatus.Processing]).toEqual(
      expect.arrayContaining([KnowledgeEntryStatus.Ready, KnowledgeEntryStatus.PartiallyReady, KnowledgeEntryStatus.Failed, KnowledgeEntryStatus.Archived]),
    );
  });

  it("allows ARCHIVED -> READY only (restore), never any other status", () => {
    expect(ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS[KnowledgeEntryStatus.Archived]).toEqual([KnowledgeEntryStatus.Ready]);
  });

  it("never allows a terminal READY/PARTIALLY_READY/FAILED entry to jump straight back without going through PROCESSING first, except to ARCHIVED", () => {
    expect(ALLOWED_KNOWLEDGE_ENTRY_TRANSITIONS[KnowledgeEntryStatus.Ready]).toEqual([KnowledgeEntryStatus.Processing, KnowledgeEntryStatus.Archived]);
  });
});

describe("parseKnowledgeEntryStatus", () => {
  it("accepts every real status value", () => {
    for (const status of Object.values(KnowledgeEntryStatus)) {
      expect(isKnowledgeEntryStatus(status)).toBe(true);
      expect(parseKnowledgeEntryStatus(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => parseKnowledgeEntryStatus("NOT_A_REAL_STATUS")).toThrow(InvalidKnowledgeEntryStatusError);
  });
});
