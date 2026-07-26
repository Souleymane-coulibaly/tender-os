import { describe, expect, it } from "vitest";
import { DocumentPermission, roleHasDocumentPermission } from "./document-permission";

describe("roleHasDocumentPermission", () => {
  it("grants Admin-tier roles (ORGANIZATION_ADMIN, BID_MANAGER) every permission", () => {
    for (const permission of Object.values(DocumentPermission)) {
      expect(roleHasDocumentPermission("ORGANIZATION_ADMIN", permission)).toBe(true);
      expect(roleHasDocumentPermission("BID_MANAGER", permission)).toBe(true);
    }
  });

  it("grants Contributor-tier (CONTRIBUTOR) read/write but not archive/restore/delete", () => {
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.Read)).toBe(true);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.Create)).toBe(true);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.UploadVersion)).toBe(true);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.Update)).toBe(true);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.AttachToTender)).toBe(true);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.Archive)).toBe(false);
    expect(roleHasDocumentPermission("CONTRIBUTOR", DocumentPermission.Delete)).toBe(false);
  });

  it("limits Viewer-tier roles to read and download", () => {
    for (const role of ["REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasDocumentPermission(role, DocumentPermission.Read)).toBe(true);
      expect(roleHasDocumentPermission(role, DocumentPermission.Download)).toBe(true);
      expect(roleHasDocumentPermission(role, DocumentPermission.Create)).toBe(false);
      expect(roleHasDocumentPermission(role, DocumentPermission.Delete)).toBe(false);
    }
  });

  it("denies every permission for an unknown role", () => {
    for (const permission of Object.values(DocumentPermission)) {
      expect(roleHasDocumentPermission("SOME_UNKNOWN_ROLE", permission)).toBe(false);
    }
  });
});
