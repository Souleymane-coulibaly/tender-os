import { describe, expect, it, vi } from "vitest";
import type { CountActiveMembersUseCase } from "../../../memberships";
import type { OrganizationSummary, ReactivateOrganizationUseCase } from "../../../organizations";
import { PlatformCapabilityMissingError } from "../../domain/errors";
import { PlatformRole } from "../../domain/platform-role";
import { InMemoryPlatformAuditLog } from "../../test-support/in-memory-platform-audit-log";
import { ReactivatePlatformOrganizationUseCase } from "./reactivate-platform-organization.use-case";

const ORG_SUMMARY: OrganizationSummary = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "ACTIVE",
  settings: {},
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
};

describe("ReactivatePlatformOrganizationUseCase", () => {
  it("reactivates the organization and records a platform audit entry", async () => {
    const reactivateOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(ORG_SUMMARY),
    } as unknown as ReactivateOrganizationUseCase;
    const countActiveMembersUseCase = { execute: vi.fn().mockResolvedValue(2) } as unknown as CountActiveMembersUseCase;
    const auditLog = new InMemoryPlatformAuditLog();
    const useCase = new ReactivatePlatformOrganizationUseCase(
      reactivateOrganizationUseCase,
      countActiveMembersUseCase,
      auditLog,
    );

    const result = await useCase.execute({ actorId: "admin-1", actorRole: PlatformRole.Owner, organizationId: "org-1" });

    expect(result.status).toBe("ACTIVE");
    expect(auditLog.entries[0]?.action).toBe("platform.organization.reactivated");
  });

  it("refuses PLATFORM_SUPPORT (read-only role)", async () => {
    const reactivateOrganizationUseCase = { execute: vi.fn() } as unknown as ReactivateOrganizationUseCase;
    const countActiveMembersUseCase = { execute: vi.fn() } as unknown as CountActiveMembersUseCase;
    const useCase = new ReactivatePlatformOrganizationUseCase(
      reactivateOrganizationUseCase,
      countActiveMembersUseCase,
      new InMemoryPlatformAuditLog(),
    );

    await expect(
      useCase.execute({ actorId: "support-1", actorRole: PlatformRole.Support, organizationId: "org-1" }),
    ).rejects.toThrow(PlatformCapabilityMissingError);
  });
});
