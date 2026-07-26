import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetCurrentUserUseCase } from "../../../identity";
import { PermissionMissingError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { ListOrganizationMembersUseCase } from "./list-organization-members.use-case";

function fakeGetCurrentUserUseCase(): GetCurrentUserUseCase {
  return {
    execute: vi.fn().mockImplementation(async ({ userId }: { userId: string }) => ({
      id: userId,
      email: `${userId}@example.com`,
      displayName: `User ${userId}`,
    })),
  } as unknown as GetCurrentUserUseCase;
}

describe("ListOrganizationMembersUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let useCase: ListOrganizationMembersUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    useCase = new ListOrganizationMembersUseCase(membershipRepository, fakeGetCurrentUserUseCase());
  });

  it("lists members of the organization enriched with user info", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-other-org"),
        organizationId: "org-OTHER",
        userId: "user-3",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      organizationId: "org-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      limit: 25,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.user.email).toBe("user-2@example.com");
  });

  it("refuses when the actor lacks organization:member:list", async () => {
    await expect(
      useCase.execute({ organizationId: "org-1", actorRole: OrganizationRole.ReadOnly, limit: 25 }),
    ).rejects.toThrow(PermissionMissingError);
  });
});
