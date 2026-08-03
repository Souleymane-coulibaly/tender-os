import { describe, expect, it } from "vitest";
import { DcePermission, roleHasDcePermission } from "./dce-permission";

describe("roleHasDcePermission", () => {
  it("grants Admin-tier roles (OWNER, ORGANIZATION_ADMIN, BID_MANAGER) every permission", () => {
    for (const permission of Object.values(DcePermission)) {
      expect(roleHasDcePermission("OWNER", permission)).toBe(true);
      expect(roleHasDcePermission("ORGANIZATION_ADMIN", permission)).toBe(true);
      expect(roleHasDcePermission("BID_MANAGER", permission)).toBe(true);
    }
  });

  // Mission Sprint 8A.2 (audit Cockpit Bid Manager) — régression : OWNER manquait de
  // `ROLE_DCE_PERMISSIONS`, un propriétaire d'organisation ne pouvait alors lire ni gérer aucun
  // DCE, contrairement à Documents/Analysis qui avaient déjà reçu ce correctif (Sprint 5 / Sprint
  // 4.1 audit Codex P1-01).
  it("regression guard — OWNER is a superset of ORGANIZATION_ADMIN, never missing an admin permission", () => {
    for (const permission of Object.values(DcePermission)) {
      expect(roleHasDcePermission("OWNER", permission)).toBe(roleHasDcePermission("ORGANIZATION_ADMIN", permission));
    }
  });

  it("grants Contributor-tier (CONTRIBUTOR) create/import/replace but not delete", () => {
    expect(roleHasDcePermission("CONTRIBUTOR", DcePermission.Read)).toBe(true);
    expect(roleHasDcePermission("CONTRIBUTOR", DcePermission.Create)).toBe(true);
    expect(roleHasDcePermission("CONTRIBUTOR", DcePermission.Import)).toBe(true);
    expect(roleHasDcePermission("CONTRIBUTOR", DcePermission.Replace)).toBe(true);
    expect(roleHasDcePermission("CONTRIBUTOR", DcePermission.Delete)).toBe(false);
  });

  it("limits Viewer-tier (read-only) roles to read and download — no import/replace/delete", () => {
    for (const role of ["REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasDcePermission(role, DcePermission.Read)).toBe(true);
      expect(roleHasDcePermission(role, DcePermission.Download)).toBe(true);
      expect(roleHasDcePermission(role, DcePermission.Import)).toBe(false);
      expect(roleHasDcePermission(role, DcePermission.Replace)).toBe(false);
      expect(roleHasDcePermission(role, DcePermission.Delete)).toBe(false);
    }
  });

  it("denies every permission for an unknown role", () => {
    for (const permission of Object.values(DcePermission)) {
      expect(roleHasDcePermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
