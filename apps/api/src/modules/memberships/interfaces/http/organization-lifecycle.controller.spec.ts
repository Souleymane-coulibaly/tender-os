import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../../../identity";
import type { GetOrganizationUseCase, OrganizationSummary } from "../../../organizations";
import type { CreateOrganizationWithOwnerUseCase } from "../../application/use-cases/create-organization-with-owner.use-case";
import type { DeleteOrganizationAsOwnerUseCase } from "../../application/use-cases/delete-organization-as-owner.use-case";
import type { UpdateOrganizationProfileUseCase } from "../../application/use-cases/update-organization-profile.use-case";
import { OrganizationRole } from "../../domain/organization-role";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import type { MembershipContext } from "./organization-membership.guard";
import { OrganizationLifecycleController } from "./organization-lifecycle.controller";

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

const ACTOR: AuthenticatedActor = { userId: "user-1", sessionId: "session-1" };
const REQUEST = { id: "request-1" } as unknown as RequestWithId;

function membershipContext(overrides?: Partial<MembershipContext>): MembershipContext {
  return { organizationId: "org-1", membershipId: "membership-actor", role: OrganizationRole.Owner, ...overrides };
}

function fakeResponse() {
  return { setHeader: vi.fn() } as unknown as import("express").Response;
}

function createController(overrides?: {
  createOrganizationWithOwnerUseCase?: Partial<CreateOrganizationWithOwnerUseCase>;
  deleteOrganizationAsOwnerUseCase?: Partial<DeleteOrganizationAsOwnerUseCase>;
  getOrganizationUseCase?: Partial<GetOrganizationUseCase>;
  updateOrganizationProfileUseCase?: Partial<UpdateOrganizationProfileUseCase>;
}) {
  const createOrganizationWithOwnerUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.createOrganizationWithOwnerUseCase,
  } as unknown as CreateOrganizationWithOwnerUseCase;

  const deleteOrganizationAsOwnerUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.deleteOrganizationAsOwnerUseCase,
  } as unknown as DeleteOrganizationAsOwnerUseCase;

  const getOrganizationUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.getOrganizationUseCase,
  } as unknown as GetOrganizationUseCase;

  const updateOrganizationProfileUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.updateOrganizationProfileUseCase,
  } as unknown as UpdateOrganizationProfileUseCase;

  const controller = new OrganizationLifecycleController(
    createOrganizationWithOwnerUseCase,
    deleteOrganizationAsOwnerUseCase,
    getOrganizationUseCase,
    updateOrganizationProfileUseCase,
  );

  return {
    controller,
    createOrganizationWithOwnerUseCase,
    deleteOrganizationAsOwnerUseCase,
    getOrganizationUseCase,
    updateOrganizationProfileUseCase,
  };
}

describe("OrganizationLifecycleController", () => {
  it("create delegates to CreateOrganizationWithOwnerUseCase, sets Location and returns a bare object", async () => {
    const { controller, createOrganizationWithOwnerUseCase } = createController();
    const response = fakeResponse();

    const result = await controller.create(
      ACTOR,
      { name: "Acme Corp", slug: "acme-corp", defaultTimezone: "Europe/Paris" },
      REQUEST,
      response,
    );

    expect(createOrganizationWithOwnerUseCase.execute).toHaveBeenCalledWith({
      name: "Acme Corp",
      slug: "acme-corp",
      defaultTimezone: "Europe/Paris",
      actorId: "user-1",
      requestId: "request-1",
    });
    expect(response.setHeader).toHaveBeenCalledWith("Location", "/api/v1/organizations/org-1");
    expect(result).toEqual(ORGANIZATION_SUMMARY);
  });

  it("remove delegates to DeleteOrganizationAsOwnerUseCase when the URL id matches the resolved organization", async () => {
    const { controller, deleteOrganizationAsOwnerUseCase } = createController();

    await controller.remove(ACTOR, membershipContext(), "org-1", REQUEST);

    expect(deleteOrganizationAsOwnerUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.Owner,
      requestId: "request-1",
    });
  });

  it("remove rejects with a not-found error when the URL id does not match the resolved organization (X-Organization-Id mismatch)", async () => {
    const { controller, deleteOrganizationAsOwnerUseCase } = createController();

    await expect(controller.remove(ACTOR, membershipContext({ organizationId: "org-1" }), "org-2", REQUEST)).rejects.toThrow();

    expect(deleteOrganizationAsOwnerUseCase.execute).not.toHaveBeenCalled();
  });

  it("getMine reads the organization resolved by the membership guard — never a client-supplied id (IDOR fix)", async () => {
    const { controller, getOrganizationUseCase } = createController();

    const result = await controller.getMine(membershipContext({ organizationId: "org-attacker-is-a-member-of" }));

    expect(getOrganizationUseCase.execute).toHaveBeenCalledWith({ id: "org-attacker-is-a-member-of" });
    expect(result).toEqual(ORGANIZATION_SUMMARY);
  });

  it("updateMine delegates to UpdateOrganizationProfileUseCase scoped to the resolved organization and actor role", async () => {
    const { controller, updateOrganizationProfileUseCase } = createController();

    const result = await controller.updateMine(
      ACTOR,
      membershipContext({ organizationId: "org-1", role: OrganizationRole.OrganizationAdmin }),
      { legalName: "Acme Corp SAS" },
      REQUEST,
    );

    expect(updateOrganizationProfileUseCase.execute).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: OrganizationRole.OrganizationAdmin,
      legalName: "Acme Corp SAS",
      requestId: "request-1",
    });
    expect(result).toEqual(ORGANIZATION_SUMMARY);
  });

  it("updateMine propagates a permission-missing rejection from the use case (e.g. actor role without organization:profile:update) rather than swallowing it", async () => {
    const { controller, updateOrganizationProfileUseCase } = createController({
      updateOrganizationProfileUseCase: {
        execute: vi.fn().mockRejectedValue(new Error("PERMISSION_MISSING")),
      },
    });

    await expect(
      controller.updateMine(ACTOR, membershipContext({ role: OrganizationRole.Contributor }), { name: "Acme" }, REQUEST),
    ).rejects.toThrow("PERMISSION_MISSING");

    expect(updateOrganizationProfileUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: OrganizationRole.Contributor }),
    );
  });
});
