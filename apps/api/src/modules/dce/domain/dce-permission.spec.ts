import { describe, expect, it } from "vitest";
import { DcePermission, roleHasDcePermission } from "./dce-permission";

describe("roleHasDcePermission", () => {
  it("grants Admin-tier roles (ORGANIZATION_ADMIN, BID_MANAGER) every permission", () => {
    for (const permission of Object.values(DcePermission)) {
      expect(roleHasDcePermission("ORGANIZATION_ADMIN", permission)).toBe(true);
      expect(roleHasDcePermission("BID_MANAGER", permission)).toBe(true);
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
