import { describe, expect, it } from "vitest";
import { OrganizationPermission, roleHasPermission } from "./organization-permission";
import { OrganizationRole } from "./organization-role";

describe("roleHasPermission", () => {
  it("grants Organization Admin every member-management permission", () => {
    expect(roleHasPermission(OrganizationRole.OrganizationAdmin, OrganizationPermission.MemberInvite)).toBe(
      true,
    );
    expect(roleHasPermission(OrganizationRole.OrganizationAdmin, OrganizationPermission.RoleAssign)).toBe(
      true,
    );
  });

  it("denies member-management permissions to every other role by default", () => {
    for (const role of Object.values(OrganizationRole)) {
      if (role === OrganizationRole.OrganizationAdmin) {
        continue;
      }
      expect(roleHasPermission(role, OrganizationPermission.MemberInvite)).toBe(false);
      expect(roleHasPermission(role, OrganizationPermission.RoleAssign)).toBe(false);
    }
  });
});
