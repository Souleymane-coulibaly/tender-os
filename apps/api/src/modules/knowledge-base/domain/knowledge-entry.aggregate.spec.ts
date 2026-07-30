import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidKnowledgeEntryStatusTransitionError, KnowledgeEntryArchivedError, KnowledgeEntryNotArchivedError } from "./errors";
import { KnowledgeCategory } from "./knowledge-category";
import { KnowledgeEntry } from "./knowledge-entry.aggregate";
import { KnowledgeEntryStatus } from "./knowledge-entry-status";
import { KnowledgeSourceType } from "./knowledge-source-type";

const NOW = new Date("2026-07-30T10:00:00Z");
const LATER = new Date("2026-07-30T11:00:00Z");
const ORG = randomUUID();
const SPACE = randomUUID();
const ACTOR = randomUUID();

function createManualEntry(): KnowledgeEntry {
  return KnowledgeEntry.create({
    id: randomUUID(),
    organizationId: ORG,
    knowledgeSpaceId: SPACE,
    title: "Référence client Acme",
    category: KnowledgeCategory.ClientReference,
    sourceType: KnowledgeSourceType.Manual,
    metadata: {},
    createdByUserId: ACTOR,
    occurredAt: NOW,
  });
}

function createImportedEntry(): KnowledgeEntry {
  return KnowledgeEntry.create({
    id: randomUUID(),
    organizationId: ORG,
    knowledgeSpaceId: SPACE,
    title: "CV de Jean Dupont",
    category: KnowledgeCategory.ConsultantProfile,
    sourceType: KnowledgeSourceType.DocumentImport,
    metadata: {},
    createdByUserId: ACTOR,
    occurredAt: NOW,
  });
}

describe("KnowledgeEntry", () => {
  it("starts READY immediately for a MANUAL entry, at version 1", () => {
    const entry = createManualEntry();
    expect(entry.status).toBe(KnowledgeEntryStatus.Ready);
    expect(entry.activeVersionNumber).toBe(1);
  });

  it("starts DRAFT for a DOCUMENT_IMPORT entry, at version 1", () => {
    const entry = createImportedEntry();
    expect(entry.status).toBe(KnowledgeEntryStatus.Draft);
    expect(entry.activeVersionNumber).toBe(1);
  });

  describe("updateMetadata", () => {
    it("bumps the version exactly once per call, regardless of how many fields changed", () => {
      const entry = createManualEntry();
      entry.updateMetadata({ title: "Nouveau titre", description: "Nouvelle description", metadata: { clientName: "Acme" } }, ACTOR, LATER);
      expect(entry.activeVersionNumber).toBe(2);
      expect(entry.title).toBe("Nouveau titre");
      expect(entry.metadata).toEqual({ clientName: "Acme" });
    });

    it("refuses to update an archived entry", () => {
      const entry = createManualEntry();
      entry.archive(LATER);
      expect(() => entry.updateMetadata({ title: "x" }, ACTOR, LATER)).toThrow(KnowledgeEntryArchivedError);
    });
  });

  describe("document processing lifecycle", () => {
    it("beginInitialProcessing never bumps the version (version 1 already represents this document)", () => {
      const entry = createImportedEntry();
      entry.beginInitialProcessing(LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Processing);
      expect(entry.activeVersionNumber).toBe(1);
    });

    it("startDocumentProcessing bumps the version (a document added later is always substantial)", () => {
      const entry = createManualEntry(); // READY, version 1
      entry.startDocumentProcessing(LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Processing);
      expect(entry.activeVersionNumber).toBe(2);
    });

    it("completeDocumentProcessing transitions to READY and records the detected language", () => {
      const entry = createImportedEntry();
      entry.beginInitialProcessing(NOW);
      entry.completeDocumentProcessing({ outcome: KnowledgeEntryStatus.Ready, language: "fr" }, LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Ready);
      expect(entry.language).toBe("fr");
    });

    it("completeDocumentProcessing transitions to FAILED on a failed extraction", () => {
      const entry = createImportedEntry();
      entry.beginInitialProcessing(NOW);
      entry.completeDocumentProcessing({ outcome: KnowledgeEntryStatus.Failed }, LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Failed);
    });

    it("rejects an invalid transition (e.g. DRAFT -> FAILED directly)", () => {
      const entry = createImportedEntry();
      expect(() => entry.completeDocumentProcessing({ outcome: KnowledgeEntryStatus.Failed }, LATER)).toThrow(InvalidKnowledgeEntryStatusTransitionError);
    });
  });

  describe("archive / restore", () => {
    it("archives from any non-archived status and records archivedAt", () => {
      const entry = createManualEntry();
      entry.archive(LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Archived);
      expect(entry.archivedAt).toEqual(LATER);
    });

    it("restores an archived entry back to READY and clears archivedAt", () => {
      const entry = createManualEntry();
      entry.archive(NOW);
      entry.restore(LATER);
      expect(entry.status).toBe(KnowledgeEntryStatus.Ready);
      expect(entry.archivedAt).toBeUndefined();
    });

    it("refuses to restore a non-archived entry", () => {
      const entry = createManualEntry();
      expect(() => entry.restore(LATER)).toThrow(KnowledgeEntryNotArchivedError);
    });
  });
});
