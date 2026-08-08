import { describe, expect, it } from "vitest";
import { KnowledgePermission, roleHasKnowledgePermission } from "./knowledge-permission";

describe("roleHasKnowledgePermission", () => {
  it("grants Admin-tier roles (OWNER, ORGANIZATION_ADMIN, BID_MANAGER) every permission", () => {
    for (const permission of Object.values(KnowledgePermission)) {
      expect(roleHasKnowledgePermission("OWNER", permission)).toBe(true);
      expect(roleHasKnowledgePermission("ORGANIZATION_ADMIN", permission)).toBe(true);
      expect(roleHasKnowledgePermission("BID_MANAGER", permission)).toBe(true);
    }
  });

  it("grants Contributor-tier (CONTRIBUTOR) read/write/import but not delete", () => {
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.Read)).toBe(true);
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.Create)).toBe(true);
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.ImportDocument)).toBe(true);
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.ManageTags)).toBe(true);
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.Archive)).toBe(true);
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.Delete)).toBe(false);
    // V2 Sprint 8 §16/§21 — la validation est un palier "règle stricte" distinct, jamais accordé
    // au CONTRIBUTOR (même motif que Delete ci-dessus).
    expect(roleHasKnowledgePermission("CONTRIBUTOR", KnowledgePermission.Validate)).toBe(false);
  });

  it("limits Viewer-tier roles (REVIEWER, EXECUTIVE, EXTERNAL_CONSULTANT, READ_ONLY) to read/search — never a write action", () => {
    for (const role of ["REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Read)).toBe(true);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Search)).toBe(true);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Create)).toBe(false);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Update)).toBe(false);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.ImportDocument)).toBe(false);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.ManageTags)).toBe(false);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Archive)).toBe(false);
      expect(roleHasKnowledgePermission(role, KnowledgePermission.Delete)).toBe(false);
    }
  });

  it("denies every permission for an unknown role", () => {
    for (const permission of Object.values(KnowledgePermission)) {
      expect(roleHasKnowledgePermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
