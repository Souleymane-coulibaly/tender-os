import { beforeEach, describe, expect, it } from "vitest";
import { PlatformCapabilityMissingError } from "../../../platform-administration/domain/errors";
import { PlatformRole } from "../../../platform-administration/domain/platform-role";
import { EntitlementFeature } from "../../domain/entitlement-feature";
import { EntitlementOverrideReasonRequiredError } from "../../domain/errors";
import { FIXED_NOW, InMemoryAuditLogWriter, InMemoryEntitlementOverrideRepository } from "../../test-support/fakes";
import { CreateEntitlementOverrideUseCase } from "./create-entitlement-override.use-case";

const ORG_A = "org-a";

describe("CreateEntitlementOverrideUseCase", () => {
  let overrides: InMemoryEntitlementOverrideRepository;
  let auditLog: InMemoryAuditLogWriter;
  let useCase: CreateEntitlementOverrideUseCase;

  beforeEach(() => {
    overrides = new InMemoryEntitlementOverrideRepository();
    auditLog = new InMemoryAuditLogWriter();
    useCase = new CreateEntitlementOverrideUseCase(overrides, auditLog);
  });

  it("mission §32 — a PLATFORM_ADMIN can create a feature override and it is audited as EntitlementOverrideChanged", async () => {
    const override = await useCase.execute({
      organizationId: ORG_A,
      feature: EntitlementFeature.PublicApi,
      featureEnabled: true,
      reason: "Pilote négocié",
      actorPlatformAdministratorId: "admin-1",
      actorPlatformRole: PlatformRole.Admin,
      occurredAt: FIXED_NOW,
    });

    expect(override.feature).toBe(EntitlementFeature.PublicApi);
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("EntitlementOverrideChanged");
  });

  it("mission §32 'POINT BLOQUANT' — PLATFORM_SUPPORT (read-only) cannot create an override", async () => {
    await expect(
      useCase.execute({
        organizationId: ORG_A,
        feature: EntitlementFeature.PublicApi,
        featureEnabled: true,
        reason: "Test",
        actorPlatformAdministratorId: "admin-1",
        actorPlatformRole: PlatformRole.Support,
        occurredAt: FIXED_NOW,
      }),
    ).rejects.toBeInstanceOf(PlatformCapabilityMissingError);
  });

  it("requires a non-empty reason", async () => {
    await expect(
      useCase.execute({
        organizationId: ORG_A,
        feature: EntitlementFeature.PublicApi,
        featureEnabled: true,
        reason: "   ",
        actorPlatformAdministratorId: "admin-1",
        actorPlatformRole: PlatformRole.Owner,
        occurredAt: FIXED_NOW,
      }),
    ).rejects.toBeInstanceOf(EntitlementOverrideReasonRequiredError);
  });

  it("mission §53 — a new override on the SAME target supersedes (revokes) the previous active one, never two contradictory active overrides", async () => {
    await useCase.execute({
      organizationId: ORG_A,
      feature: EntitlementFeature.PublicApi,
      featureEnabled: true,
      reason: "First",
      actorPlatformAdministratorId: "admin-1",
      actorPlatformRole: PlatformRole.Owner,
      occurredAt: FIXED_NOW,
    });
    const second = await useCase.execute({
      organizationId: ORG_A,
      feature: EntitlementFeature.PublicApi,
      featureEnabled: false,
      reason: "Second, supersedes first",
      actorPlatformAdministratorId: "admin-1",
      actorPlatformRole: PlatformRole.Owner,
      occurredAt: new Date(FIXED_NOW.getTime() + 1000),
    });

    const active = await overrides.findActiveFeatureOverride(ORG_A, EntitlementFeature.PublicApi, new Date(FIXED_NOW.getTime() + 2000));
    expect(active?.id).toBe(second.id);
    expect(active?.featureEnabled).toBe(false);
  });
});
