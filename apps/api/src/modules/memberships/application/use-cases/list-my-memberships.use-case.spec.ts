import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetOrganizationUseCase } from "../../../organizations";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { ListMyMembershipsUseCase } from "./list-my-memberships.use-case";

function fakeGetOrganizationUseCase(overrides?: { execute?: ReturnType<typeof vi.fn> }): GetOrganizationUseCase {
  return {
    execute:
      overrides?.execute ??
      vi.fn().mockImplementation(async ({ id }: { id: string }) => ({ id, name: `Org ${id}`, slug: id })),
  } as unknown as GetOrganizationUseCase;
}

describe("ListMyMembershipsUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
  });

  it("returns the caller's memberships enriched with organization info", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-1",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-2"),
        organizationId: "org-2",
        userId: "user-1",
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );
    const useCase = new ListMyMembershipsUseCase(membershipRepository, fakeGetOrganizationUseCase());

    const result = await useCase.execute({ userId: "user-1", limit: 25 });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.organization.slug).sort()).toEqual(["org-1", "org-2"]);
  });

  it("silently skips a membership whose organization can no longer be found", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-deleted",
        userId: "user-1",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );
    const useCase = new ListMyMembershipsUseCase(
      membershipRepository,
      fakeGetOrganizationUseCase({ execute: vi.fn().mockRejectedValue(new Error("ORGANIZATION_NOT_FOUND")) }),
    );

    const result = await useCase.execute({ userId: "user-1", limit: 25 });

    expect(result.items).toHaveLength(0);
  });
});
