import { describe, expect, it } from "vitest";
import { AiBenchmarkPermission, roleHasAiBenchmarkPermission } from "./ai-benchmark-permission";

describe("ai-benchmark-permission", () => {
  it("OWNER and ORGANIZATION_ADMIN have every permission, including mutating ones", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN"]) {
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ManageModels)).toBe(true);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.LaunchBenchmark)).toBe(true);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ApproveRecommendation)).toBe(true);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ManageRoutingPolicies)).toBe(true);
    }
  });

  it("every other role, even ones with elevated Tenders/Analysis rights, is read-only here", () => {
    for (const role of ["BID_MANAGER", "CONTRIBUTOR", "REVIEWER", "EXECUTIVE", "EXTERNAL_CONSULTANT", "READ_ONLY"]) {
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ReadModels)).toBe(true);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ManageModels)).toBe(false);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.LaunchBenchmark)).toBe(false);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ApproveRecommendation)).toBe(false);
      expect(roleHasAiBenchmarkPermission(role, AiBenchmarkPermission.ManageRoutingPolicies)).toBe(false);
    }
  });

  it("an unknown role has no permission at all", () => {
    expect(roleHasAiBenchmarkPermission("SOME_UNKNOWN_ROLE", AiBenchmarkPermission.ReadModels)).toBe(false);
  });
});
