import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GetCurrentUserUseCase } from "../../../identity";
import { MembershipAlreadyExistsError, OwnershipRequiresTransferError, PermissionMissingError, SeatLimitExceededError } from "../../domain/errors";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateMembershipUseCase } from "./create-membership.use-case";
import type { SeatLimitProvider } from "../ports/seat-limit-provider";

function fakeGetCurrentUserUseCase(overrides?: { execute?: ReturnType<typeof vi.fn> }): GetCurrentUserUseCase {
  return {
    execute: overrides?.execute ?? vi.fn().mockResolvedValue({ id: "user-2", email: "bob@example.com" }),
  } as unknown as GetCurrentUserUseCase;
}

function fakeSeatLimitProvider(limit: number | "UNLIMITED"): SeatLimitProvider {
  return { getSeatLimit: vi.fn().mockResolvedValue(limit) };
}

describe("CreateMembershipUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
  });

  function createUseCase(getCurrentUserUseCase = fakeGetCurrentUserUseCase(), seatLimitProvider?: SeatLimitProvider): CreateMembershipUseCase {
    return new CreateMembershipUseCase(membershipRepository, auditLogWriter, getCurrentUserUseCase, new FixedClock(), new SequentialIdGenerator(), outboxWriter, seatLimitProvider);
  }

  async function seedActiveMembers(organizationId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await membershipRepository.seed(
        OrganizationMembership.create({ id: MembershipId.from(`seat-filler-${i}`), organizationId, userId: `filler-user-${i}`, role: OrganizationRole.Contributor, occurredAt: new Date() }),
      );
    }
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

  it("V2 Sprint 22 (billing, étape 22E) — emits MembershipCreated (jamais sur une lecture, toujours au point d'écriture réel)", async () => {
    const useCase = createUseCase();

    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      userId: "user-2",
      role: OrganizationRole.Contributor,
    });

    expect(outboxWriter.events.map((e) => e.eventType)).toEqual(["MembershipCreated"]);
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

  it("Checkpoint TENDEROS-2.1-P2.3-E1 (mission §15) — refuses when active members already reached the plan's seat limit", async () => {
    await seedActiveMembers("org-1", 2);
    const useCase = createUseCase(fakeGetCurrentUserUseCase(), fakeSeatLimitProvider(2));

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, userId: "user-2", role: OrganizationRole.Contributor }),
    ).rejects.toThrow(SeatLimitExceededError);
    expect(auditLogWriter.entries).toHaveLength(0);
  });

  it("Checkpoint TENDEROS-2.1-P2.3-E1 (mission §15) — allows creation when active members are below the seat limit", async () => {
    await seedActiveMembers("org-1", 1);
    const useCase = createUseCase(fakeGetCurrentUserUseCase(), fakeSeatLimitProvider(2));

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, userId: "user-2", role: OrganizationRole.Contributor });

    expect(result.status).toBe("ACTIVE");
  });

  it("Checkpoint TENDEROS-2.1-P2.3-E1 (mission §15) — UNLIMITED (e.g. Enterprise) never blocks, regardless of current member count", async () => {
    await seedActiveMembers("org-1", 500);
    const useCase = createUseCase(fakeGetCurrentUserUseCase(), fakeSeatLimitProvider("UNLIMITED"));

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, userId: "user-2", role: OrganizationRole.Contributor });

    expect(result.status).toBe("ACTIVE");
  });

  it("Checkpoint TENDEROS-2.1-P2.3-E1 — with no seat-limit bridge wired (seatLimitProvider undefined), creation is never blocked (no regression by omission)", async () => {
    await seedActiveMembers("org-1", 999);
    const useCase = createUseCase(fakeGetCurrentUserUseCase(), undefined);

    const result = await useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, userId: "user-2", role: OrganizationRole.Contributor });

    expect(result.status).toBe("ACTIVE");
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
