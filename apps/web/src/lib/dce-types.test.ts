import { describe, expect, it } from "vitest";
import { canDeleteDceDocument, canImportOrReplaceDceDocument, isReadyForAnalysis } from "./dce-types";

describe("canImportOrReplaceDceDocument", () => {
  it("allows the admin tier", () => {
    expect(canImportOrReplaceDceDocument("ORGANIZATION_ADMIN")).toBe(true);
    expect(canImportOrReplaceDceDocument("BID_MANAGER")).toBe(true);
  });

  it("allows the contributor tier", () => {
    expect(canImportOrReplaceDceDocument("CONTRIBUTOR")).toBe(true);
  });

  it("rejects viewer-tier roles and an undefined role", () => {
    expect(canImportOrReplaceDceDocument("READ_ONLY")).toBe(false);
    expect(canImportOrReplaceDceDocument("REVIEWER")).toBe(false);
    expect(canImportOrReplaceDceDocument(undefined)).toBe(false);
  });

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager) — régression : OWNER manquait du miroir
  // ADMIN_TIER (jamais mis à jour après le correctif backend OWNER de dce-permission.ts), rendant
  // "Initialiser le DCE"/import/remplacement invisibles pour un propriétaire d'organisation —
  // découvert en écrivant le parcours Playwright du Cockpit.
  it("allows OWNER (superset of ORGANIZATION_ADMIN, backend-mirrored)", () => {
    expect(canImportOrReplaceDceDocument("OWNER")).toBe(true);
  });
});

describe("canDeleteDceDocument", () => {
  it("allows only the admin tier", () => {
    expect(canDeleteDceDocument("OWNER")).toBe(true);
    expect(canDeleteDceDocument("ORGANIZATION_ADMIN")).toBe(true);
    expect(canDeleteDceDocument("BID_MANAGER")).toBe(true);
    expect(canDeleteDceDocument("CONTRIBUTOR")).toBe(false);
    expect(canDeleteDceDocument(undefined)).toBe(false);
  });
});

describe("isReadyForAnalysis", () => {
  it("is true only for READY_FOR_ANALYSIS and READY_FOR_ANALYSIS_WITH_WARNINGS", () => {
    expect(isReadyForAnalysis("READY_FOR_ANALYSIS")).toBe(true);
    expect(isReadyForAnalysis("READY_FOR_ANALYSIS_WITH_WARNINGS")).toBe(true);
    expect(isReadyForAnalysis("IMPORTED")).toBe(false);
    expect(isReadyForAnalysis("PENDING_TEXT_INSPECTION")).toBe(false);
    expect(isReadyForAnalysis("NOT_PROCESSABLE")).toBe(false);
  });
});
