import { describe, expect, it, vi } from "vitest";
import type { FindUserByEmailUseCase } from "../../../identity";
import { UserNotFoundError } from "../../../identity";
import { PermissionMissingError, SeatLimitExceededError } from "../../domain/errors";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FakeOutboxWriter, FixedClock, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import type { SeatLimitProvider } from "../ports/seat-limit-provider";
import { CreateMembershipUseCase } from "./create-membership.use-case";
import { InviteMemberByEmailUseCase } from "./invite-member-by-email.use-case";

function fakeFindUserByEmailUseCase(result: { id: string; email: string } | null): FindUserByEmailUseCase {
  return { execute: vi.fn().mockResolvedValue(result) } as unknown as FindUserByEmailUseCase;
}

/**
 * Checkpoint TENDEROS-2.1-P2.3-E2 (Onboarding V2, mission §14) — prouve que ce use case reste une
 * PURE résolution email -> userId devant `CreateMembershipUseCase` (jamais un second moteur) : les
 * invariants d'unicité/permission/seat-limit sont déjà couverts exhaustivement par
 * `create-membership.use-case.spec.ts` — ici on prouve uniquement le CÂBLAGE (email résolu -> même
 * comportement que l'ajout par identifiant ; email non résolu -> UserNotFoundError, jamais un succès
 * silencieux ; permission vérifiée AVANT toute résolution email, mission "ne jamais révéler
 * l'existence d'un compte à un acteur sans droit").
 */
describe("InviteMemberByEmailUseCase", () => {
  function buildUseCase(input: { findResult: { id: string; email: string } | null; seatLimitProvider?: SeatLimitProvider }) {
    const membershipRepository = new InMemoryMembershipRepository();
    const auditLogWriter = new InMemoryAuditLogWriter();
    const outboxWriter = new FakeOutboxWriter();
    const getCurrentUserUseCase = { execute: vi.fn().mockResolvedValue(input.findResult ?? { id: "unused" }) } as never;
    const createMembershipUseCase = new CreateMembershipUseCase(
      membershipRepository,
      auditLogWriter,
      getCurrentUserUseCase,
      new FixedClock(),
      new SequentialIdGenerator(),
      outboxWriter,
      input.seatLimitProvider,
    );
    const findUserByEmailUseCase = fakeFindUserByEmailUseCase(input.findResult);
    return { useCase: new InviteMemberByEmailUseCase(findUserByEmailUseCase, createMembershipUseCase), findUserByEmailUseCase, auditLogWriter };
  }

  it("resolves the email to an existing account and delegates entirely to CreateMembershipUseCase (same result shape)", async () => {
    const { useCase, auditLogWriter } = buildUseCase({ findResult: { id: "user-2", email: "bob@example.com" } });

    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      email: "bob@example.com",
      role: OrganizationRole.Contributor,
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.role).toBe("CONTRIBUTOR");
    expect(auditLogWriter.entries).toHaveLength(1);
  });

  it("refuses with UserNotFoundError when no account exists for the email — never a silent success, never a second invitation mechanism", async () => {
    const { useCase, findUserByEmailUseCase } = buildUseCase({ findResult: null });

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, email: "unknown@example.com", role: OrganizationRole.Contributor }),
    ).rejects.toThrow(UserNotFoundError);
    expect(findUserByEmailUseCase.execute).toHaveBeenCalledOnce();
  });

  it("checks the actor's permission BEFORE resolving the email — never reveals whether an account exists to an unauthorized actor", async () => {
    const { useCase, findUserByEmailUseCase } = buildUseCase({ findResult: { id: "user-2", email: "bob@example.com" } });

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.Contributor, email: "bob@example.com", role: OrganizationRole.Contributor }),
    ).rejects.toThrow(PermissionMissingError);
    expect(findUserByEmailUseCase.execute).not.toHaveBeenCalled();
  });

  it("still enforces the atomic seat limit through CreateMembershipUseCase (no bypass via the email path)", async () => {
    const { useCase } = buildUseCase({ findResult: { id: "user-2", email: "bob@example.com" }, seatLimitProvider: { getSeatLimit: vi.fn().mockResolvedValue(0) } });

    await expect(
      useCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: OrganizationRole.OrganizationAdmin, email: "bob@example.com", role: OrganizationRole.Contributor }),
    ).rejects.toThrow(SeatLimitExceededError);
  });
});
