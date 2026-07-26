import { describe, expect, it, vi } from "vitest";
import type { CountActiveMembersUseCase } from "../../../memberships";
import type { GetOrganizationUseCase, OrganizationSummary } from "../../../organizations";
import { PlatformRole } from "../../domain/platform-role";
import { GetPlatformOrganizationUseCase } from "./get-platform-organization.use-case";

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

describe("GetPlatformOrganizationUseCase", () => {
  it("returns the organization enriched with its active member count", async () => {
    const getOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(ORG_SUMMARY),
    } as unknown as GetOrganizationUseCase;
    const countActiveMembersUseCase = { execute: vi.fn().mockResolvedValue(4) } as unknown as CountActiveMembersUseCase;
    const useCase = new GetPlatformOrganizationUseCase(getOrganizationUseCase, countActiveMembersUseCase);

    const result = await useCase.execute({ actorRole: PlatformRole.Support, organizationId: "org-1" });

    expect(result.activeMemberCount).toBe(4);
    expect(result.name).toBe("Acme Corp");
  });
});
