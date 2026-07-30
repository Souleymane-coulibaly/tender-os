import { describe, expect, it } from "vitest";
import { AnalysisPermission, roleHasAnalysisPermission } from "./analysis-permission";

/**
 * Correction audit Codex Sprint 4.1 (P1-01) — OWNER était absent de `ROLE_ANALYSIS_PERMISSIONS`,
 * ce qui laissait le propriétaire d'organisation sans aucune permission Analysis. Ce fichier
 * n'existait pas avant la correction : c'est précisément l'absence de test sur cette matrice qui a
 * permis à l'anomalie de passer inaperçue.
 */
describe("roleHasAnalysisPermission", () => {
  it("grants OWNER the same full permission set as ORGANIZATION_ADMIN", () => {
    for (const permission of Object.values(AnalysisPermission)) {
      expect(roleHasAnalysisPermission("OWNER", permission)).toBe(true);
      expect(roleHasAnalysisPermission("ORGANIZATION_ADMIN", permission)).toBe(true);
    }
  });

  it("grants CONTRIBUTOR read/trigger/cancel but never denies READ_ONLY read access", () => {
    expect(roleHasAnalysisPermission("CONTRIBUTOR", AnalysisPermission.Trigger)).toBe(true);
    expect(roleHasAnalysisPermission("READ_ONLY", AnalysisPermission.Read)).toBe(true);
  });

  it("never grants READ_ONLY (or other viewer roles) write permissions", () => {
    for (const role of ["READ_ONLY", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT"]) {
      expect(roleHasAnalysisPermission(role, AnalysisPermission.Trigger)).toBe(false);
      expect(roleHasAnalysisPermission(role, AnalysisPermission.Cancel)).toBe(false);
    }
  });

  it("denies every permission for an unknown role (default-deny)", () => {
    for (const permission of Object.values(AnalysisPermission)) {
      expect(roleHasAnalysisPermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
