import { beforeEach, describe, expect, it } from "vitest";
import { LastOrganizationAdminError, PermissionMissingError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { SuspendMembershipUseCase } from "./suspend-membership.use-case";

describe("SuspendMembershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: SuspendMembershipUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new SuspendMembershipUseCase(membershipRepository, auditLogWriter, new FixedClock());
  });

  it("suspends a member when the actor is an Organization Admin", async () => {
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
    });

    expect(result.status).toBe("SUSPENDED");
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.suspended");
  });

  it("refuses when the actor lacks organization:member:suspend", async () => {
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
        actorRole: OrganizationRole.ReadOnly,
      }),
    ).rejects.toThrow(PermissionMissingError);
  });

  it("refuses to suspend the last active Organization Admin", async () => {
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
