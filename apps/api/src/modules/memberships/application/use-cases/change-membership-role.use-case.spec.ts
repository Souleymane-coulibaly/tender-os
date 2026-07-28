import { beforeEach, describe, expect, it } from "vitest";
import {
  LastOrganizationAdminError,
  MembershipNotFoundError,
  OwnershipRequiresTransferError,
  PermissionMissingError,
} from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { ChangeMembershipRoleUseCase } from "./change-membership-role.use-case";

describe("ChangeMembershipRoleUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: ChangeMembershipRoleUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new ChangeMembershipRoleUseCase(membershipRepository, auditLogWriter, new FixedClock());
  });

  it("changes the role when the actor is an Organization Admin", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      role: OrganizationRole.BidManager,
    });

    expect(result.role).toBe("BID_MANAGER");
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.role_changed");
  });

  it("refuses when the actor lacks organization:role:assign", async () => {
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
        actorRole: OrganizationRole.BidManager,
        role: OrganizationRole.Reviewer,
      }),
    ).rejects.toThrow(PermissionMissingError);
  });

  it("refuses to demote the last active Organization Admin", async () => {
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
        role: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(LastOrganizationAdminError);
  });

  it("allows demoting an admin when another active admin remains", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-1"),
        organizationId: "org-1",
        userId: "user-1",
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-2"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );

    const result = await useCase.execute({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-2",
      actorRole: OrganizationRole.OrganizationAdmin,
      role: OrganizationRole.Contributor,
    });

    expect(result.role).toBe("CONTRIBUTOR");
  });

  it("throws when the target membership does not exist in this organization", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        membershipId: "missing-membership",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        role: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(MembershipNotFoundError);
  });

  it("refuses to assign OWNER via an ordinary role change (an Organization Admin cannot promote to Owner)", async () => {
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
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        role: OrganizationRole.Owner,
      }),
    ).rejects.toThrow(OwnershipRequiresTransferError);
  });

  it("refuses to demote the OWNER via an ordinary role change (must go through ownership transfer)", async () => {
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-owner"),
        organizationId: "org-1",
        userId: "user-1",
        role: OrganizationRole.Owner,
        occurredAt: new Date(),
      }),
    );
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-admin"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.OrganizationAdmin,
        occurredAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        membershipId: "membership-owner",
        actorId: "user-2",
        actorRole: OrganizationRole.OrganizationAdmin,
        role: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(OwnershipRequiresTransferError);
  });
});
