import { describe, expect, it } from "vitest";
import { InvalidOrganizationRoleError } from "./errors";
import { OrganizationRole, parseOrganizationRole } from "./organization-role";

describe("parseOrganizationRole", () => {
  it("accepts every canonical role code", () => {
    for (const role of Object.values(OrganizationRole)) {
      expect(parseOrganizationRole(role)).toBe(role);
    }
  });

  it("rejects an unknown role code", () => {
    expect(() => parseOrganizationRole("SUPER_ADMIN")).toThrow(InvalidOrganizationRoleError);
  });
});
