import { describe, expect, it } from "vitest";
import { IntegrationPermission, roleHasIntegrationPermission } from "./integration-permission";

describe("roleHasIntegrationPermission — mission §59-61", () => {
  it("grants OWNER and ORGANIZATION_ADMIN full access", () => {
    expect(roleHasIntegrationPermission("OWNER", IntegrationPermission.ApiKeysManage)).toBe(true);
    expect(roleHasIntegrationPermission("ORGANIZATION_ADMIN", IntegrationPermission.WebhooksManage)).toBe(true);
  });

  it("BLOQUANT — a standard CONTRIBUTOR has no integration permission, not even read (mission §61)", () => {
    expect(roleHasIntegrationPermission("CONTRIBUTOR", IntegrationPermission.Read)).toBe(false);
    expect(roleHasIntegrationPermission("CONTRIBUTOR", IntegrationPermission.ApiKeysManage)).toBe(false);
    expect(roleHasIntegrationPermission("CONTRIBUTOR", IntegrationPermission.WebhooksManage)).toBe(false);
  });

  it("BLOQUANT — BID_MANAGER, despite broad Tenders rights elsewhere, has no integration permission", () => {
    expect(roleHasIntegrationPermission("BID_MANAGER", IntegrationPermission.Manage)).toBe(false);
  });

  it("an unknown role has no permission", () => {
    expect(roleHasIntegrationPermission("UNKNOWN_ROLE", IntegrationPermission.Read)).toBe(false);
  });
});
