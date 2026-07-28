import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedActor } from "../../../identity";
import type { OrganizationSummary } from "../../../organizations";
import type { CreateOrganizationWithOwnerUseCase } from "../../application/use-cases/create-organization-with-owner.use-case";
import type { DeleteOrganizationAsOwnerUseCase } from "../../application/use-cases/delete-organization-as-owner.use-case";
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
}) {
  const createOrganizationWithOwnerUseCase = {
    execute: vi.fn().mockResolvedValue(ORGANIZATION_SUMMARY),
    ...overrides?.createOrganizationWithOwnerUseCase,
  } as unknown as CreateOrganizationWithOwnerUseCase;

  const deleteOrganizationAsOwnerUseCase = {
    execute: vi.fn().mockResolvedValue(undefined),
    ...overrides?.deleteOrganizationAsOwnerUseCase,
  } as unknown as DeleteOrganizationAsOwnerUseCase;

  const controller = new OrganizationLifecycleController(
    createOrganizationWithOwnerUseCase,
    deleteOrganizationAsOwnerUseCase,
  );

  return { controller, createOrganizationWithOwnerUseCase, deleteOrganizationAsOwnerUseCase };
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
});
