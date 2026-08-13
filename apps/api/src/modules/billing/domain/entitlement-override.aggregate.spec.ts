import { describe, expect, it } from "vitest";
import { EntitlementFeature } from "./entitlement-feature";
import { EntitlementOverride } from "./entitlement-override.aggregate";
import { EntitlementOverrideAlreadyRevokedError, InvalidEntitlementOverrideTargetError } from "./errors";
import { QuotaType } from "./quota-type";

const OCCURRED_AT = new Date("2026-08-13T09:00:00Z");

describe("EntitlementOverride", () => {
  it("mission §31 — must target exactly one of feature or quota, never both", () => {
    expect(() =>
      EntitlementOverride.create({
        id: "o-1",
        organizationId: "org-a",
        feature: EntitlementFeature.PublicApi,
        featureEnabled: true,
        quota: QuotaType.UsersMax,
        quotaLimit: 5,
        reason: "Test",
        createdByPlatformAdministratorId: "admin-1",
        occurredAt: OCCURRED_AT,
      }),
    ).toThrow(InvalidEntitlementOverrideTargetError);
  });

  it("must target at least one of feature or quota, never neither", () => {
    expect(() =>
      EntitlementOverride.create({ id: "o-1", organizationId: "org-a", reason: "Test", createdByPlatformAdministratorId: "admin-1", occurredAt: OCCURRED_AT }),
    ).toThrow(InvalidEntitlementOverrideTargetError);
  });

  it("is active by default with no expiration", () => {
    const override = EntitlementOverride.create({
      id: "o-1",
      organizationId: "org-a",
      feature: EntitlementFeature.Webhooks,
      featureEnabled: true,
      reason: "Test",
      createdByPlatformAdministratorId: "admin-1",
      occurredAt: OCCURRED_AT,
    });
    expect(override.isActive(OCCURRED_AT)).toBe(true);
  });

  it("mission §36 — an override past its expiresAt is no longer active", () => {
    const override = EntitlementOverride.create({
      id: "o-1",
      organizationId: "org-a",
      feature: EntitlementFeature.Webhooks,
      featureEnabled: true,
      reason: "Test",
      createdByPlatformAdministratorId: "admin-1",
      expiresAt: new Date(OCCURRED_AT.getTime() + 1000),
      occurredAt: OCCURRED_AT,
    });
    expect(override.isActive(new Date(OCCURRED_AT.getTime() + 500))).toBe(true);
    expect(override.isActive(new Date(OCCURRED_AT.getTime() + 2000))).toBe(false);
  });

  it("a revoked override is never active again, and cannot be revoked twice", () => {
    const override = EntitlementOverride.create({
      id: "o-1",
      organizationId: "org-a",
      feature: EntitlementFeature.Webhooks,
      featureEnabled: true,
      reason: "Test",
      createdByPlatformAdministratorId: "admin-1",
      occurredAt: OCCURRED_AT,
    });
    override.revoke({ revokedByPlatformAdministratorId: "admin-2", occurredAt: OCCURRED_AT });

    expect(override.isActive(OCCURRED_AT)).toBe(false);
    expect(() => override.revoke({ revokedByPlatformAdministratorId: "admin-2", occurredAt: OCCURRED_AT })).toThrow(EntitlementOverrideAlreadyRevokedError);
  });
});
