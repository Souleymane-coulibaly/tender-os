import { beforeEach, describe, expect, it } from "vitest";
import { PlatformCapabilityMissingError } from "../../../platform-administration/domain/errors";
import { PlatformRole } from "../../../platform-administration/domain/platform-role";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import { EntitlementOverride } from "../../domain/entitlement-override.aggregate";
import { EntitlementOverrideNotFoundError } from "../../domain/errors";
import { FIXED_NOW, InMemoryAuditLogWriter, InMemoryEntitlementOverrideRepository } from "../../test-support/fakes";
import { RevokeEntitlementOverrideUseCase } from "./revoke-entitlement-override.use-case";

const ORG_A = "org-a";

describe("RevokeEntitlementOverrideUseCase", () => {
  let overrides: InMemoryEntitlementOverrideRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: RevokeEntitlementOverrideUseCase;

  beforeEach(async () => {
    overrides = new InMemoryEntitlementOverrideRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new RevokeEntitlementOverrideUseCase(overrides, auditLog);

    await overrides.save(
      EntitlementOverride.create({
        id: "override-1",
        organizationId: ORG_A,
        feature: EntitlementFeature.PublicApi,
        featureEnabled: true,
        reason: "Test",
        createdByPlatformAdministratorId: "admin-1",
        occurredAt: FIXED_NOW,
      }),
    );
  });

  it("revokes an active override and audits EntitlementOverrideChanged", async () => {
    await useCase.execute({ organizationId: ORG_A, overrideId: "override-1", actorPlatformAdministratorId: "admin-2", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW });

    const active = await overrides.findActiveFeatureOverride(ORG_A, EntitlementFeature.PublicApi, FIXED_NOW);
    expect(active).toBeNull();
    expect(auditLog.entries).toHaveLength(1);
  });

  it("mission §60 — PLATFORM_SUPPORT (read-only) cannot revoke an override", async () => {
    await expect(
      useCase.execute({ organizationId: ORG_A, overrideId: "override-1", actorPlatformAdministratorId: "admin-2", actorPlatformRole: PlatformRole.Support, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(PlatformCapabilityMissingError);
  });

  it("throws when the override does not exist for this organization (cross-tenant IDOR guard)", async () => {
    await expect(
      useCase.execute({ organizationId: "org-b", overrideId: "override-1", actorPlatformAdministratorId: "admin-2", actorPlatformRole: PlatformRole.Owner, occurredAt: FIXED_NOW }),
    ).rejects.toBeInstanceOf(EntitlementOverrideNotFoundError);
  });
});
