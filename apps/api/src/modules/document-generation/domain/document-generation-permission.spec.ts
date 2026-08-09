import { describe, expect, it } from "vitest";
import { DocumentGenerationPermission, roleHasDocumentGenerationPermission } from "./document-generation-permission";

describe("roleHasDocumentGenerationPermission", () => {
  it("grants full template management to OWNER and ORGANIZATION_ADMIN only", () => {
    expect(roleHasDocumentGenerationPermission("OWNER", DocumentGenerationPermission.ManageTemplates)).toBe(true);
    expect(roleHasDocumentGenerationPermission("ORGANIZATION_ADMIN", DocumentGenerationPermission.ManageTemplates)).toBe(true);
  });

  it("BLOCKING — never grants template management to BID_MANAGER/CONTRIBUTOR/REVIEWER", () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasDocumentGenerationPermission(role, DocumentGenerationPermission.ManageTemplates)).toBe(false);
    }
  });

  it("grants read-only template access to every known role", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasDocumentGenerationPermission(role, DocumentGenerationPermission.ReadTemplates)).toBe(true);
    }
  });

  it("grants nothing to an unknown role", () => {
    expect(roleHasDocumentGenerationPermission("SOMETHING_MADE_UP", DocumentGenerationPermission.ReadTemplates)).toBe(false);
  });
});
