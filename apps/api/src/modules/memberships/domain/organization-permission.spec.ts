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
      if (role === OrganizationRole.OrganizationAdmin || role === OrganizationRole.Owner) {
        continue;
      }
      expect(roleHasPermission(role, OrganizationPermission.MemberInvite)).toBe(false);
      expect(roleHasPermission(role, OrganizationPermission.RoleAssign)).toBe(false);
    }
  });

  it("grants Owner every Organization Admin permission plus organization:delete and ownership transfer", () => {
    expect(roleHasPermission(OrganizationRole.Owner, OrganizationPermission.MemberInvite)).toBe(true);
    expect(roleHasPermission(OrganizationRole.Owner, OrganizationPermission.RoleAssign)).toBe(true);
    expect(roleHasPermission(OrganizationRole.Owner, OrganizationPermission.OrganizationDelete)).toBe(true);
    expect(roleHasPermission(OrganizationRole.Owner, OrganizationPermission.OwnershipTransfer)).toBe(true);
  });

  it("denies organization:delete and ownership transfer to every role except Owner", () => {
    for (const role of Object.values(OrganizationRole)) {
      if (role === OrganizationRole.Owner) {
        continue;
      }
      expect(roleHasPermission(role, OrganizationPermission.OrganizationDelete)).toBe(false);
      expect(roleHasPermission(role, OrganizationPermission.OwnershipTransfer)).toBe(false);
    }
  });
});
