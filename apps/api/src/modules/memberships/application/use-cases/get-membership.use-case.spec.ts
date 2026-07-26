import { beforeEach, describe, expect, it } from "vitest";
import { MembershipNotFoundError, PermissionMissingError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { GetMembershipUseCase } from "./get-membership.use-case";

describe("GetMembershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let useCase: GetMembershipUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    useCase = new GetMembershipUseCase(membershipRepository);
  });

  it("lets an Organization Admin read another member's profile", async () => {
    const membership = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-2",
      role: OrganizationRole.Contributor,
      occurredAt: new Date(),
    });
    await membershipRepository.seed(membership);

    const result = await useCase.execute({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
    });

    expect(result.userId).toBe("user-2");
  });

  it("lets a member read their own membership without organization:member:list", async () => {
    const membership = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-2",
      role: OrganizationRole.Contributor,
      occurredAt: new Date(),
    });
    await membershipRepository.seed(membership);

    const result = await useCase.execute({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-2",
      actorRole: OrganizationRole.Contributor,
    });

    expect(result.id).toBe("membership-1");
  });

  it("refuses when a non-admin actor reads someone else's membership", async () => {
    const membership = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-2",
      role: OrganizationRole.Contributor,
      occurredAt: new Date(),
    });
    await membershipRepository.seed(membership);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        membershipId: "membership-1",
        actorId: "user-3",
        actorRole: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(PermissionMissingError);
  });

  it("throws when the membership does not exist in this organization (cross-tenant isolation)", async () => {
    const membership = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-2",
      role: OrganizationRole.Contributor,
      occurredAt: new Date(),
    });
    await membershipRepository.seed(membership);

    await expect(
      useCase.execute({
        organizationId: "org-OTHER",
        membershipId: "membership-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
      }),
    ).rejects.toThrow(MembershipNotFoundError);
  });
});
