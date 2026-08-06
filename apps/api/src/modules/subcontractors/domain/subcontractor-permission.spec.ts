import { describe, expect, it } from "vitest";
import { roleHasSubcontractorPermission, SubcontractorPermission } from "./subcontractor-permission";

describe("roleHasSubcontractorPermission (mission V2 Sprint 2 §7 — matrice organisationnelle dédiée)", () => {
  it("grants OWNER full access including Archive", () => {
    expect(roleHasSubcontractorPermission("OWNER", SubcontractorPermission.Read)).toBe(true);
    expect(roleHasSubcontractorPermission("OWNER", SubcontractorPermission.Manage)).toBe(true);
    expect(roleHasSubcontractorPermission("OWNER", SubcontractorPermission.Archive)).toBe(true);
  });

  it("grants CONTRIBUTOR Read+Manage but never Archive", () => {
    expect(roleHasSubcontractorPermission("CONTRIBUTOR", SubcontractorPermission.Read)).toBe(true);
    expect(roleHasSubcontractorPermission("CONTRIBUTOR", SubcontractorPermission.Manage)).toBe(true);
    expect(roleHasSubcontractorPermission("CONTRIBUTOR", SubcontractorPermission.Archive)).toBe(false);
  });

  it("grants READ_ONLY nothing but Read", () => {
    expect(roleHasSubcontractorPermission("READ_ONLY", SubcontractorPermission.Read)).toBe(true);
    expect(roleHasSubcontractorPermission("READ_ONLY", SubcontractorPermission.Manage)).toBe(false);
    expect(roleHasSubcontractorPermission("READ_ONLY", SubcontractorPermission.Archive)).toBe(false);
  });

  it("denies everything for an unknown/invalid role string (PERM-001 default deny)", () => {
    expect(roleHasSubcontractorPermission("NOT_A_ROLE", SubcontractorPermission.Read)).toBe(false);
  });
});
