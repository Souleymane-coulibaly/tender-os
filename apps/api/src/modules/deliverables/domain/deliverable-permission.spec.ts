import { describe, expect, it } from "vitest";
import { DeliverablePermission, roleHasDeliverablePermission } from "./deliverable-permission";

/** Mission §17 — "Gérer templates : Non [pour MEMBER]" / "Gérer thème organisation : Non [pour
 *  MEMBER]" : réservé strictement à OWNER/ORGANIZATION_ADMIN, jamais délégable via un rôle client. */
describe("roleHasDeliverablePermission (organization-tier only)", () => {
  it("grants OWNER and ORGANIZATION_ADMIN both template/theme management capabilities", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(roleHasDeliverablePermission(role, DeliverablePermission.ManageDeliverableTemplates)).toBe(true);
      expect(roleHasDeliverablePermission(role, DeliverablePermission.ManageDocumentThemes)).toBe(true);
    }
  });

  it("never grants template/theme management to any client-facing organization role", () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasDeliverablePermission(role, DeliverablePermission.ManageDeliverableTemplates)).toBe(false);
      expect(roleHasDeliverablePermission(role, DeliverablePermission.ManageDocumentThemes)).toBe(false);
    }
  });

  it("grants an unknown role absolutely nothing", () => {
    expect(roleHasDeliverablePermission("SOME_UNKNOWN_ROLE", DeliverablePermission.ManageDeliverableTemplates)).toBe(false);
  });
});
