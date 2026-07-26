import { describe, expect, it } from "vitest";
import { PlatformCapability, roleHasCapability } from "./platform-capability";
import { PlatformRole } from "./platform-role";

describe("roleHasCapability", () => {
  it("grants OWNER and ADMIN the ability to suspend organizations", () => {
    expect(roleHasCapability(PlatformRole.Owner, PlatformCapability.OrganizationsSuspend)).toBe(true);
    expect(roleHasCapability(PlatformRole.Admin, PlatformCapability.OrganizationsSuspend)).toBe(true);
  });

  it("denies SUPPORT the ability to suspend or reactivate organizations", () => {
    expect(roleHasCapability(PlatformRole.Support, PlatformCapability.OrganizationsSuspend)).toBe(false);
    expect(roleHasCapability(PlatformRole.Support, PlatformCapability.OrganizationsReactivate)).toBe(false);
  });

  it("grants every role read access to organizations, users, audit logs and metrics", () => {
    for (const role of Object.values(PlatformRole)) {
      expect(roleHasCapability(role, PlatformCapability.OrganizationsRead)).toBe(true);
      expect(roleHasCapability(role, PlatformCapability.UsersRead)).toBe(true);
      expect(roleHasCapability(role, PlatformCapability.AuditLogsRead)).toBe(true);
      expect(roleHasCapability(role, PlatformCapability.MetricsRead)).toBe(true);
    }
  });
});
