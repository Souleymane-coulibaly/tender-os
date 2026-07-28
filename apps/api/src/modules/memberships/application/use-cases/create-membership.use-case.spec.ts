import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetCurrentUserUseCase } from "../../../identity";
import { MembershipAlreadyExistsError, OwnershipRequiresTransferError, PermissionMissingError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateMembershipUseCase } from "./create-membership.use-case";

function fakeGetCurrentUserUseCase(overrides?: { execute?: ReturnType<typeof vi.fn> }): GetCurrentUserUseCase {
  return {
    execute: overrides?.execute ?? vi.fn().mockResolvedValue({ id: "user-2", email: "bob@example.com" }),
  } as unknown as GetCurrentUserUseCase;
}

describe("CreateMembershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
  });

  function createUseCase(getCurrentUserUseCase = fakeGetCurrentUserUseCase()): CreateMembershipUseCase {
    return new CreateMembershipUseCase(
      membershipRepository,
      auditLogWriter,
      getCurrentUserUseCase,
      new FixedClock(),
      new SequentialIdGenerator(),
    );
  }

  it("creates an active membership when the actor is an Organization Admin", async () => {
    const useCase = createUseCase();

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      userId: "user-2",
      role: OrganizationRole.Contributor,
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.role).toBe("CONTRIBUTOR");
    expect(auditLogWriter.entries).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.created");
  });

  it("refuses when the actor lacks organization:member:invite", async () => {
    const useCase = createUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.Contributor,
        userId: "user-2",
        role: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow(PermissionMissingError);
  });

  it("refuses a duplicate membership for the same organization and user", async () => {
    const useCase = createUseCase();
    const existing = OrganizationMembership.create({
      id: MembershipId.from("membership-1"),
      organizationId: "org-1",
      userId: "user-2",
      role: OrganizationRole.Contributor,
      occurredAt: new Date(),
    });
    await membershipRepository.seed(existing);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        userId: "user-2",
        role: OrganizationRole.Reviewer,
      }),
    ).rejects.toThrow(MembershipAlreadyExistsError);
  });

  it("refuses to create a membership with role OWNER when the actor is an Organization Admin", async () => {
    const useCase = createUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        userId: "user-2",
        role: "OWNER",
      }),
    ).rejects.toThrow(OwnershipRequiresTransferError);
  });

  it("refuses to create a membership with role OWNER even when the actor is already OWNER", async () => {
    const useCase = createUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.Owner,
        userId: "user-2",
        role: "OWNER",
      }),
    ).rejects.toThrow(OwnershipRequiresTransferError);

    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("refuses a forged DTO whose role value is OWNER regardless of casing/source", async () => {
    const useCase = createUseCase();

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        userId: "user-2",
        role: OrganizationRole.Owner,
      }),
    ).rejects.toThrow(OwnershipRequiresTransferError);
  });

  it("propagates UserNotFoundError when the target user does not exist", async () => {
    const failingUseCase = fakeGetCurrentUserUseCase({
      execute: vi.fn().mockRejectedValue(new Error("USER_NOT_FOUND")),
    });
    const useCase = createUseCase(failingUseCase);

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: OrganizationRole.OrganizationAdmin,
        userId: "missing-user",
        role: OrganizationRole.Contributor,
      }),
    ).rejects.toThrow("USER_NOT_FOUND");
  });
});
