import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../../../identity";
import type { MembershipSummary } from "../../application/dtos";
import type { ChangeMembershipRoleUseCase } from "../../application/use-cases/change-membership-role.use-case";
import type { CreateMembershipUseCase } from "../../application/use-cases/create-membership.use-case";
import type { GetMembershipUseCase } from "../../application/use-cases/get-membership.use-case";
import type { ListMyMembershipsUseCase } from "../../application/use-cases/list-my-memberships.use-case";
import type { ListOrganizationMembersUseCase } from "../../application/use-cases/list-organization-members.use-case";
import type { RemoveMembershipUseCase } from "../../application/use-cases/remove-membership.use-case";
import type { SuspendMembershipUseCase } from "../../application/use-cases/suspend-membership.use-case";
import type { TransferOrganizationOwnershipUseCase } from "../../application/use-cases/transfer-organization-ownership.use-case";
import { OrganizationRole } from "../../domain/organization-role";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import type { MembershipContext } from "./organization-membership.guard";
import { OrganizationMembershipsController } from "./organization-memberships.controller";

const MEMBERSHIP_SUMMARY: MembershipSummary = {
  id: "membership-1",
  organizationId: "org-1",
  userId: "user-2",
  role: "CONTRIBUTOR",
  status: "ACTIVE",
  joinedAt: "2026-07-26T14:00:00.000Z",
  createdAt: "2026-07-26T14:00:00.000Z",
  updatedAt: "2026-07-26T14:00:00.000Z",
};

const ACTOR: AuthenticatedActor = { userId: "user-1", sessionId: "session-1" };
const MEMBERSHIP_CONTEXT: MembershipContext = {
  organizationId: "org-1",
  membershipId: "membership-actor",
  role: OrganizationRole.OrganizationAdmin,
};
const REQUEST = { id: "request-1" } as unknown as RequestWithId;

function createController(overrides?: {
  createMembershipUseCase?: Partial<CreateMembershipUseCase>;
  getMembershipUseCase?: Partial<GetMembershipUseCase>;
  listOrganizationMembersUseCase?: Partial<ListOrganizationMembersUseCase>;
  listMyMembershipsUseCase?: Partial<ListMyMembershipsUseCase>;
  changeMembershipRoleUseCase?: Partial<ChangeMembershipRoleUseCase>;
  suspendMembershipUseCase?: Partial<SuspendMembershipUseCase>;
  removeMembershipUseCase?: Partial<RemoveMembershipUseCase>;
  transferOrganizationOwnershipUseCase?: Partial<TransferOrganizationOwnershipUseCase>;
}) {
  const createMembershipUseCase = {
    execute: vi.fn().mockResolvedValue(MEMBERSHIP_SUMMARY),
    ...overrides?.createMembershipUseCase,
  } as unknown as CreateMembershipUseCase;

  const getMembershipUseCase = {
    execute: vi.fn().mockResolvedValue(MEMBERSHIP_SUMMARY),
    ...overrides?.getMembershipUseCase,
  } as unknown as GetMembershipUseCase;

  const listOrganizationMembersUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    ...overrides?.listOrganizationMembersUseCase,
  } as unknown as ListOrganizationMembersUseCase;

  const listMyMembershipsUseCase = {
    execute: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    ...overrides?.listMyMembershipsUseCase,
  } as unknown as ListMyMembershipsUseCase;

  const changeMembershipRoleUseCase = {
    execute: vi.fn().mockResolvedValue({ ...MEMBERSHIP_SUMMARY, role: "BID_MANAGER" }),
    ...overrides?.changeMembershipRoleUseCase,
  } as unknown as ChangeMembershipRoleUseCase;

  const suspendMembershipUseCase = {
    execute: vi.fn().mockResolvedValue({ ...MEMBERSHIP_SUMMARY, status: "SUSPENDED" }),
    ...overrides?.suspendMembershipUseCase,
  } as unknown as SuspendMembershipUseCase;

  const removeMembershipUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.removeMembershipUseCase,
  } as unknown as RemoveMembershipUseCase;

  const transferOrganizationOwnershipUseCase = {
    execute: vi.fn().mockResolvedValue({
      previousOwner: { ...MEMBERSHIP_SUMMARY, id: "membership-actor", role: "ORGANIZATION_ADMIN" },
      newOwner: { ...MEMBERSHIP_SUMMARY, role: "OWNER" },
    }),
    ...overrides?.transferOrganizationOwnershipUseCase,
  } as unknown as TransferOrganizationOwnershipUseCase;

  const controller = new OrganizationMembershipsController(
    createMembershipUseCase,
    getMembershipUseCase,
    listOrganizationMembersUseCase,
    listMyMembershipsUseCase,
    changeMembershipRoleUseCase,
    suspendMembershipUseCase,
    removeMembershipUseCase,
    transferOrganizationOwnershipUseCase,
  );

  return {
    controller,
    createMembershipUseCase,
    getMembershipUseCase,
    listOrganizationMembersUseCase,
    listMyMembershipsUseCase,
    changeMembershipRoleUseCase,
    suspendMembershipUseCase,
    removeMembershipUseCase,
    transferOrganizationOwnershipUseCase,
  };
}

describe("OrganizationMembershipsController", () => {
  it("create delegates to CreateMembershipUseCase using the resolved membership context", async () => {
    const { controller, createMembershipUseCase } = createController();

    const result = await controller.create(
      ACTOR,
      MEMBERSHIP_CONTEXT,
      { userId: "user-2", role: "CONTRIBUTOR" },
      REQUEST,
    );

    expect(createMembershipUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      userId: "user-2",
      role: "CONTRIBUTOR",
      expiresAt: undefined,
      requestId: "request-1",
    });
    expect(result).toEqual(MEMBERSHIP_SUMMARY);
  });

  it("list delegates to ListOrganizationMembersUseCase scoped to the resolved organization", async () => {
    const { controller, listOrganizationMembersUseCase } = createController();

    await controller.list(MEMBERSHIP_CONTEXT, { limit: 25 });

    expect(listOrganizationMembersUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      cursor: undefined,
      limit: 25,
    });
  });

  it("listMine delegates to ListMyMembershipsUseCase scoped to the actor", async () => {
    const { controller, listMyMembershipsUseCase } = createController();

    await controller.listMine(ACTOR, { limit: 25 });

    expect(listMyMembershipsUseCase.execute).toHaveBeenCalledWith({
      userId: "user-1",
      cursor: undefined,
      limit: 25,
    });
  });

  it("get delegates to GetMembershipUseCase", async () => {
    const { controller, getMembershipUseCase } = createController();

    await controller.get(ACTOR, MEMBERSHIP_CONTEXT, "membership-1");

    expect(getMembershipUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
    });
  });

  it("changeRole delegates to ChangeMembershipRoleUseCase", async () => {
    const { controller, changeMembershipRoleUseCase } = createController();

    const result = await controller.changeRole(
      ACTOR,
      MEMBERSHIP_CONTEXT,
      "membership-1",
      { role: "BID_MANAGER" },
      REQUEST,
    );

    expect(changeMembershipRoleUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      role: "BID_MANAGER",
      requestId: "request-1",
    });
    expect(result.role).toBe("BID_MANAGER");
  });

  it("suspend delegates to SuspendMembershipUseCase", async () => {
    const { controller, suspendMembershipUseCase } = createController();

    const result = await controller.suspend(ACTOR, MEMBERSHIP_CONTEXT, "membership-1", REQUEST);

    expect(suspendMembershipUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      requestId: "request-1",
    });
    expect(result.status).toBe("SUSPENDED");
  });

  it("transferOwnership delegates to TransferOrganizationOwnershipUseCase", async () => {
    const { controller, transferOrganizationOwnershipUseCase } = createController();

    const result = await controller.transferOwnership(
      ACTOR,
      MEMBERSHIP_CONTEXT,
      { newOwnerMembershipId: "membership-1" },
      REQUEST,
    );

    expect(transferOrganizationOwnershipUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorId: "user-1",
      newOwnerMembershipId: "membership-1",
      requestId: "request-1",
    });
    expect(result.newOwner.role).toBe("OWNER");
  });

  it("remove delegates to RemoveMembershipUseCase", async () => {
    const { controller, removeMembershipUseCase } = createController();

    await controller.remove(ACTOR, MEMBERSHIP_CONTEXT, "membership-1", REQUEST);

    expect(removeMembershipUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      membershipId: "membership-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      requestId: "request-1",
    });
  });
});
