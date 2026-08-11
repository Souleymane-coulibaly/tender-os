import { describe, expect, it } from "vitest";
import { MarketWatchPermissionMissingError } from "./errors";
import { assertHasMarketWatchPermission, MarketWatchPermission, roleHasMarketWatchPermission } from "./market-watch-permission";

describe("market-watch-permission — mission §70", () => {
  it("BLOQUANT — CONTRIBUTOR can manage their own saved searches (decision validated: not OWNER/ADMIN-only)", () => {
    expect(roleHasMarketWatchPermission("CONTRIBUTOR", MarketWatchPermission.ManageSavedSearch)).toBe(true);
  });

  it("BLOQUANT — READ_ONLY and EXTERNAL_CONSULTANT have no market watch access at all", () => {
    expect(roleHasMarketWatchPermission("READ_ONLY", MarketWatchPermission.Read)).toBe(false);
    expect(roleHasMarketWatchPermission("EXTERNAL_CONSULTANT", MarketWatchPermission.ManageSavedSearch)).toBe(false);
  });

  it("OWNER/ORGANIZATION_ADMIN/BID_MANAGER/REVIEWER/EXECUTIVE all have full access", () => {
    for (const role of ["OWNER", "ORGANIZATION_ADMIN", "BID_MANAGER", "REVIEWER", "EXECUTIVE"]) {
      expect(roleHasMarketWatchPermission(role, MarketWatchPermission.Read)).toBe(true);
      expect(roleHasMarketWatchPermission(role, MarketWatchPermission.ManageSavedSearch)).toBe(true);
    }
  });

  it("assertHasMarketWatchPermission throws for a role without the permission", () => {
    expect(() => assertHasMarketWatchPermission("READ_ONLY", MarketWatchPermission.Read)).toThrow(MarketWatchPermissionMissingError);
  });
});
