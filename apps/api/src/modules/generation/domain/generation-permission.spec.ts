import { describe, expect, it } from "vitest";
import { GenerationPermission, roleHasGenerationPermission } from "./generation-permission";

describe("GenerationPermission (prompt template management, org-wide)", () => {
  it("grants OWNER and ORGANIZATION_ADMIN full management rights", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(roleHasGenerationPermission(role, GenerationPermission.ReadPromptTemplates)).toBe(true);
      expect(roleHasGenerationPermission(role, GenerationPermission.ManagePromptTemplates)).toBe(true);
    }
  });

  it("gives every other real role read-only access, never management", () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasGenerationPermission(role, GenerationPermission.ReadPromptTemplates)).toBe(true);
      expect(roleHasGenerationPermission(role, GenerationPermission.ManagePromptTemplates)).toBe(false);
    }
  });

  it("gives an unknown role no permission at all", () => {
    expect(roleHasGenerationPermission("SOMETHING_UNKNOWN", GenerationPermission.ReadPromptTemplates)).toBe(false);
  });
});
