import { beforeEach, describe, expect, it } from "vitest";
import {
  CannotTransferOwnershipToSelfError,
  MembershipNotActiveError,
  MembershipNotFoundError,
  NotOrganizationOwnerError,
} from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { TransferOrganizationOwnershipUseCase } from "./transfer-organization-ownership.use-case";

describe("TransferOrganizationOwnershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: TransferOrganizationOwnershipUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new TransferOrganizationOwnershipUseCase(membershipRepository, auditLogWriter, new FixedClock());
  });

  async function seedOwnerAndMember(): Promise<void> {
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
        id: MembershipId.from("membership-member"),
        organizationId: "org-1",
        userId: "user-2",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );
  }

  it("transfers ownership to an active member: the new member becomes OWNER, the former OWNER becomes Organization Admin", async () => {
    await seedOwnerAndMember();

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      newOwnerMembershipId: "membership-member",
    });

    expect(result.newOwner.role).toBe("OWNER");
    expect(result.previousOwner.role).toBe("ORGANIZATION_ADMIN");

    const previousOwner = await membershipRepository.findById({
      organizationId: "org-1",
      membershipId: "membership-owner",
    });
    const newOwner = await membershipRepository.findById({
      organizationId: "org-1",
      membershipId: "membership-member",
    });
    expect(previousOwner?.role).toBe(OrganizationRole.OrganizationAdmin);
    expect(newOwner?.role).toBe(OrganizationRole.Owner);
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.ownership_transferred");
  });

  it("refuses when the actor is not the current OWNER", async () => {
    await seedOwnerAndMember();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-2",
        newOwnerMembershipId: "membership-owner",
      }),
    ).rejects.toThrow(NotOrganizationOwnerError);
  });

  it("refuses when the actor has no membership in this organization", async () => {
    await seedOwnerAndMember();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-999",
        newOwnerMembershipId: "membership-member",
      }),
    ).rejects.toThrow(MembershipNotFoundError);
  });

  it("refuses a transfer to a membership outside the organization (no external transfer)", async () => {
    await seedOwnerAndMember();
    await membershipRepository.seed(
      OrganizationMembership.create({
        id: MembershipId.from("membership-external"),
        organizationId: "org-2",
        userId: "user-3",
        role: OrganizationRole.Contributor,
        occurredAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        newOwnerMembershipId: "membership-external",
      }),
    ).rejects.toThrow(MembershipNotFoundError);
  });

  it("refuses to transfer ownership to oneself", async () => {
    await seedOwnerAndMember();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        newOwnerMembershipId: "membership-owner",
      }),
    ).rejects.toThrow(CannotTransferOwnershipToSelfError);
  });

  it("refuses to transfer ownership to a suspended member", async () => {
    await seedOwnerAndMember();
    const member = await membershipRepository.findById({ organizationId: "org-1", membershipId: "membership-member" });
    member?.suspend(new Date());
    if (member) {
      await membershipRepository.save(member);
    }

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        newOwnerMembershipId: "membership-member",
      }),
    ).rejects.toThrow(MembershipNotActiveError);
  });

  it("never leaves the organization without an OWNER when the transfer succeeds", async () => {
    await seedOwnerAndMember();

    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      newOwnerMembershipId: "membership-member",
    });

    const { items } = await membershipRepository.listByOrganization({ organizationId: "org-1", limit: 10 });
    const owners = items.filter((membership) => membership.role === OrganizationRole.Owner);
    expect(owners).toHaveLength(1);
  });
});
