import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateOrganizationUseCase, DeleteOrganizationUseCase, GetOrganizationUseCase, OrganizationSummary } from "../../../organizations";
import { MembershipId } from "../../domain/membership-id.value-object";
import { MembershipStatus } from "../../domain/membership-status";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { InMemoryMembershipRepository } from "../../test-support/in-memory-membership.repository";
import { FixedClock, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateOrganizationWithOwnerUseCase } from "./create-organization-with-owner.use-case";

const ORGANIZATION_SUMMARY: OrganizationSummary = {
  id: "org-1",
  name: "Acme Corp",
  slug: "acme-corp",
  defaultCurrency: "EUR",
  defaultTimezone: "Europe/Paris",
  status: "TRIAL",
  settings: {},
  createdAt: "2026-07-26T14:00:00.000Z",
  updatedAt: "2026-07-26T14:00:00.000Z",
};

describe("CreateOrganizationWithOwnerUseCase", () => {
  let membershipRepository: InMemoryMembershipRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createOrganizationUseCase: CreateOrganizationUseCase;
  let deleteOrganizationUseCase: DeleteOrganizationUseCase;
  let getOrganizationUseCase: GetOrganizationUseCase;
  let useCase: CreateOrganizationWithOwnerUseCase;

  beforeEach(() => {
    membershipRepository = new InMemoryMembershipRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    createOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    } as unknown as CreateOrganizationUseCase;
    deleteOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as DeleteOrganizationUseCase;
    getOrganizationUseCase = {
      execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    } as unknown as GetOrganizationUseCase;
    useCase = new CreateOrganizationWithOwnerUseCase(
      createOrganizationUseCase,
      deleteOrganizationUseCase,
      getOrganizationUseCase,
      membershipRepository,
      auditLogWriter,
      new FixedClock(),
      new SequentialIdGenerator(),
    );
  });

  it("creates the organization and makes the creator its OWNER", async () => {
    const result = await useCase.execute({
      name: "Acme Corp",
      slug: "acme-corp",
      defaultTimezone: "Europe/Paris",
      actorId: "user-1",
      requestId: "request-1",
    });

    expect(result).toEqual(ORGANIZATION_SUMMARY);

    const ownerMembership = await membershipRepository.findByOrganizationAndUser({
      organizationId: "org-1",
      userId: "user-1",
    });
    expect(ownerMembership).not.toBeNull();
    expect(ownerMembership?.role).toBe(OrganizationRole.Owner);
    expect(ownerMembership?.status).toBe(MembershipStatus.Active);
    expect(auditLogWriter.entries[0]?.action).toBe("organization_membership.created");
    expect(auditLogWriter.entries[0]?.metadata).toMatchObject({ role: OrganizationRole.Owner, ownerBootstrap: true });
  });

  it("compensates by deleting the organization when the OWNER membership cannot be created", async () => {
    const failure = new Error("membership repository unavailable");
    vi.spyOn(membershipRepository, "save").mockRejectedValueOnce(failure);

    await expect(
      useCase.execute({
        name: "Acme Corp",
        slug: "acme-corp",
        defaultTimezone: "Europe/Paris",
        actorId: "user-1",
      }),
    ).rejects.toThrow(failure);

    expect(deleteOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-1" });
  });

  it("does not let a compensation-delete failure mask the original error", async () => {
    const failure = new Error("membership repository unavailable");
    vi.spyOn(membershipRepository, "save").mockRejectedValueOnce(failure);
    vi.mocked(deleteOrganizationUseCase.execute).mockRejectedValueOnce(new Error("delete also failed"));

    await expect(
      useCase.execute({
        name: "Acme Corp",
        slug: "acme-corp",
        defaultTimezone: "Europe/Paris",
        actorId: "user-1",
      }),
    ).rejects.toThrow(failure);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E2, audit Codex (correctif P1 — bootstrap idempotent)", () => {
    it("without reuseExistingIfPresent (default/historical behavior) — always creates a new organization, even if the actor already has one", async () => {
      await membershipRepository.seed(
        OrganizationMembership.create({ id: MembershipId.from("membership-existing"), organizationId: "org-existing", userId: "user-1", role: OrganizationRole.Owner, occurredAt: new Date() }),
      );

      const result = await useCase.execute({ name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris", actorId: "user-1" });

      expect(createOrganizationUseCase.execute).toHaveBeenCalledOnce();
      expect(result).toEqual(ORGANIZATION_SUMMARY);
    });

    it("reuseExistingIfPresent: true — reuses the actor's existing organization instead of creating a second one", async () => {
      await membershipRepository.seed(
        OrganizationMembership.create({ id: MembershipId.from("membership-existing"), organizationId: "org-existing", userId: "user-1", role: OrganizationRole.Owner, occurredAt: new Date() }),
      );
      vi.mocked(getOrganizationUseCase.execute).mockResolvedValueOnce({ ...ORGANIZATION_SUMMARY, id: "org-existing" });

      const result = await useCase.execute({ name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris", actorId: "user-1", reuseExistingIfPresent: true });

      expect(createOrganizationUseCase.execute).not.toHaveBeenCalled();
      expect(getOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-existing" });
      expect(result.id).toBe("org-existing");
    });

    it("reuseExistingIfPresent: true — creates normally when the actor has no organization yet (genuine bootstrap)", async () => {
      const result = await useCase.execute({ name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris", actorId: "user-1", reuseExistingIfPresent: true });

      expect(createOrganizationUseCase.execute).toHaveBeenCalledOnce();
      expect(result).toEqual(ORGANIZATION_SUMMARY);
    });

    it("reuseExistingIfPresent: true — the bootstrap sequence runs entirely under runExclusiveForActor, never outside it", async () => {
      const runExclusiveSpy = vi.spyOn(membershipRepository, "runExclusiveForActor");

      await useCase.execute({ name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris", actorId: "user-1", reuseExistingIfPresent: true });

      expect(runExclusiveSpy).toHaveBeenCalledWith(expect.objectContaining({ actorId: "user-1" }));
    });
  });
});
