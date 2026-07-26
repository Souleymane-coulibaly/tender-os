import { beforeEach, describe, expect, it } from "vitest";
import { LastOrganizationAdminError, PermissionMissingError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { MembershipStatus } from "../../domain/membership-status";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { RemoveMembershipUseCase } from "./remove-membership.use-case";

describe("RemoveMembershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: RemoveMembershipUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new RemoveMembershipUseCase(membershipRepository, auditLogWriter, new FixedClock());
  });

  it("removes a member when the actor is an Organization Admin", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );

    await useCase.execute({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
    });

    const stored = await membershipRepository.findById({ organizationId: "org-1", membershipId: "membership-1" });
    expect(stored?.status).toBe(MembershipStatus.Removed);
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.removed");
  });

  it("refuses when the actor lacks organization:member:remove", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        membershipId: "membership-1",
        actorId: "user-3",
        actorRole: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(PermissionMissingError);
  });

  it("refuses to remove the last active Organization Admin", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-1",
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        membershipId: "membership-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
      }),
    ).rejects.toThrow(LastOrganizationAdminError);
  });
});
