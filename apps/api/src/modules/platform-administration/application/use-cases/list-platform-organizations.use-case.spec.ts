import { describe, expect, it, vi } from "vitest";
import type { CountActiveMembersUseCase } from "../../../memberships";
import type { ListOrganizationsUseCase, OrganizationSummary } from "../../../organizations";
import { PlatformRole } from "../../domain/platform-role";
import { ListPlatformOrganizationsUseCase } from "./list-platform-organizations.use-case";

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

describe("ListPlatformOrganizationsUseCase", () => {
  it("enriches each organization with its active member count", async () => {
    const listOrganizationsUseCase = {
      execute: vi.fn().mockResolvedValue({ items: [ORG_SUMMARY], nextCursor: null }),
    } as unknown as ListOrganizationsUseCase;
    const countActiveMembersUseCase = {
      execute: vi.fn().mockResolvedValue(3),
    } as unknown as CountActiveMembersUseCase;
    const useCase = new ListPlatformOrganizationsUseCase(listOrganizationsUseCase, countActiveMembersUseCase);

    const result = await useCase.execute({ actorRole: PlatformRole.Owner, limit: 25 });

    expect(result.items[0]?.activeMemberCount).toBe(3);
  });

});
