import { describe, expect, it, vi } from "vitest";
import type { CountActiveMembersUseCase } from "../../../memberships";
import type { OrganizationSummary, SuspendOrganizationUseCase } from "../../../organizations";
import { PlatformCapabilityMissingError } from "../../domain/errors";
import { PlatformRole } from "../../domain/platform-role";
import { InMemoryPlatformAuditLog } from "../../test-support/in-memory-platform-audit-log";
import { SuspendPlatformOrganizationUseCase } from "./suspend-platform-organization.use-case";

const ORG_SUMMARY: OrganizationSummary = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "SUSPENDED",
  settings: {},
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

function createUseCase(auditLog = new InMemoryPlatformAuditLog()) {
  const suspendOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORG_SUMMARY),
  } as unknown as SuspendOrganizationUseCase;
  const countActiveMembersUseCase = { execute: vi.fn().mockResolvedValue(2) } as unknown as CountActiveMembersUseCase;

  return {
    useCase: new SuspendPlatformOrganizationUseCase(suspendOrganizationUseCase, countActiveMembersUseCase, auditLog),
    auditLog,
    suspendOrganizationUseCase,
  };
}

describe("SuspendPlatformOrganizationUseCase", () => {
  it("suspends the organization and records a platform audit entry when actor is OWNER", async () => {
    const { useCase, auditLog } = createUseCase();

    const result = await useCase.execute({
      actorId: "admin-1",
      actorRole: PlatformRole.Owner,
      organizationId: "org-1",
      reason: "Payment dispute",
    });

    expect(result.status).toBe("SUSPENDED");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]?.action).toBe("platform.organization.suspended");
    expect(auditLog.entries[0]?.metadata).toEqual({ reason: "Payment dispute" });
  });

  it("allows PLATFORM_ADMIN to suspend", async () => {
    const { useCase } = createUseCase();

    await expect(
      useCase.execute({ actorId: "admin-1", actorRole: PlatformRole.Admin, organizationId: "org-1" }),
    ).resolves.toBeDefined();
  });

  it("refuses PLATFORM_SUPPORT (read-only role)", async () => {
    const { useCase, suspendOrganizationUseCase } = createUseCase();

    await expect(
      useCase.execute({ actorId: "support-1", actorRole: PlatformRole.Support, organizationId: "org-1" }),
    ).rejects.toThrow(PlatformCapabilityMissingError);
    expect(suspendOrganizationUseCase.execute).not.toHaveBeenCalled();
  });
});
