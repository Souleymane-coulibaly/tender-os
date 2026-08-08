import { describe, expect, it } from "vitest";
import {
  canCreateOrEditKnowledgeEntry,
  canDeleteKnowledgeEntry,
  canManageKnowledgeLifecycle,
  canValidateKnowledgeEntry,
  formatProvenanceLocation,
  isKnowledgeEntryValidatable,
} from "./knowledge-types";

describe("canCreateOrEditKnowledgeEntry", () => {
  it("allows the admin tier and the contributor tier", () => {
    expect(canCreateOrEditKnowledgeEntry("OWNER")).toBe(true);
    expect(canCreateOrEditKnowledgeEntry("ORGANIZATION_ADMIN")).toBe(true);
    expect(canCreateOrEditKnowledgeEntry("BID_MANAGER")).toBe(true);
    expect(canCreateOrEditKnowledgeEntry("CONTRIBUTOR")).toBe(true);
  });

  it("rejects viewer-tier roles and an undefined role", () => {
    expect(canCreateOrEditKnowledgeEntry("READ_ONLY")).toBe(false);
    expect(canCreateOrEditKnowledgeEntry("REVIEWER")).toBe(false);
    expect(canCreateOrEditKnowledgeEntry(undefined)).toBe(false);
  });
});

describe("canManageKnowledgeLifecycle", () => {
  it("allows archiving/restoring for the admin tier and the contributor tier", () => {
    expect(canManageKnowledgeLifecycle("OWNER")).toBe(true);
    expect(canManageKnowledgeLifecycle("CONTRIBUTOR")).toBe(true);
    expect(canManageKnowledgeLifecycle("READ_ONLY")).toBe(false);
  });
});

describe("canDeleteKnowledgeEntry", () => {
  it("allows only the admin tier (never the contributor tier)", () => {
    expect(canDeleteKnowledgeEntry("OWNER")).toBe(true);
    expect(canDeleteKnowledgeEntry("ORGANIZATION_ADMIN")).toBe(true);
    expect(canDeleteKnowledgeEntry("CONTRIBUTOR")).toBe(false);
    expect(canDeleteKnowledgeEntry(undefined)).toBe(false);
  });
});

describe("canValidateKnowledgeEntry", () => {
  it("allows only the admin tier (never the contributor tier)", () => {
    expect(canValidateKnowledgeEntry("OWNER")).toBe(true);
    expect(canValidateKnowledgeEntry("BID_MANAGER")).toBe(true);
    expect(canValidateKnowledgeEntry("CONTRIBUTOR")).toBe(false);
    expect(canValidateKnowledgeEntry(undefined)).toBe(false);
  });
});

describe("isKnowledgeEntryValidatable", () => {
  it("allows READY and PARTIALLY_READY entries that are not yet validated", () => {
    expect(isKnowledgeEntryValidatable({ status: "READY" })).toBe(true);
    expect(isKnowledgeEntryValidatable({ status: "PARTIALLY_READY" })).toBe(true);
  });

  it("rejects an entry that is already validated", () => {
    expect(isKnowledgeEntryValidatable({ status: "READY", validatedAt: "2026-08-08T10:00:00Z" })).toBe(false);
  });

  it("rejects DRAFT, PROCESSING, FAILED, and ARCHIVED entries", () => {
    expect(isKnowledgeEntryValidatable({ status: "DRAFT" })).toBe(false);
    expect(isKnowledgeEntryValidatable({ status: "PROCESSING" })).toBe(false);
    expect(isKnowledgeEntryValidatable({ status: "FAILED" })).toBe(false);
    expect(isKnowledgeEntryValidatable({ status: "ARCHIVED" })).toBe(false);
  });
});

describe("formatProvenanceLocation", () => {
  it("formats a single page", () => {
    expect(formatProvenanceLocation({ pageStart: 3 })).toBe("p.3");
  });

  it("formats a page range", () => {
    expect(formatProvenanceLocation({ pageStart: 3, pageEnd: 5 })).toBe("p.3-5");
  });

  it("combines page, sheet, and section when present", () => {
    expect(formatProvenanceLocation({ pageStart: 2, sheetName: "Feuille 1", sectionTitle: "Introduction" })).toBe(
      "p.2 — Feuille 1 — Introduction",
    );
  });

  it("returns undefined when nothing is available", () => {
    expect(formatProvenanceLocation({})).toBeUndefined();
  });
});
