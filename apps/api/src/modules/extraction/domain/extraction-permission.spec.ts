import { describe, expect, it } from "vitest";
import { ExtractionPermission, roleHasExtractionPermission } from "./extraction-permission";

/**
 * Correction réaudit Codex Sprint 4.1 (P1-01-R) — OWNER était absent de
 * ROLE_EXTRACTION_PERMISSIONS, ce qui bloquait indirectement StartDocumentAnalysisUseCase (via
 * GetDocumentAnalysisInputUseCase, qui exige ExtractionPermission.Read) pour un propriétaire
 * d'organisation. Ce fichier n'existait pas avant la correction.
 */
describe("roleHasExtractionPermission", () => {
  it("grants OWNER the same full permission set as ORGANIZATION_ADMIN", () => {
    for (const permission of Object.values(ExtractionPermission)) {
      expect(roleHasExtractionPermission("OWNER", permission)).toBe(true);
      expect(roleHasExtractionPermission("ORGANIZATION_ADMIN", permission)).toBe(true);
    }
  });

  it("never grants READ_ONLY (or other viewer roles) the Trigger permission", () => {
    for (const role of ["READ_ONLY", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT"]) {
      expect(roleHasExtractionPermission(role, ExtractionPermission.Trigger)).toBe(false);
      expect(roleHasExtractionPermission(role, ExtractionPermission.Read)).toBe(true);
    }
  });

  it("denies every permission for an unknown role (default-deny)", () => {
    for (const permission of Object.values(ExtractionPermission)) {
      expect(roleHasExtractionPermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
